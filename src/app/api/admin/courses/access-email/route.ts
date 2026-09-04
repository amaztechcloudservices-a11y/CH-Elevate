import { createHash, randomBytes } from "node:crypto";
import { and, eq, gte, isNull } from "drizzle-orm";
import { z } from "zod";
import { accountInvitations, auditLogs, courseRegistrations, organisationMemberships, profiles, registrationParticipants, user } from "@/db/schema";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { lockCourseOffering } from "@/server/course-enrolment";
import { sendCourseMail } from "@/server/course-mail";
import { getDb } from "@/server/db";
import { getSiteMailConfig } from "@/server/site-mail";

const schema = z.discriminatedUnion("recipient", [
  z.object({ registrationId: z.uuid(), recipient: z.literal("participant"), participantId: z.uuid() }).strict(),
  z.object({ registrationId: z.uuid(), recipient: z.literal("coordinator") }).strict(),
]);
const fail = (message: string, status: number) => Response.json({ ok: false, error: { message } }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  try {
    const { session } = await requireClientAdmin(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) return fail("A same-origin request is required.", 403);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail("Select a registered student or organisation coordinator.", 422);
    if (!getSiteMailConfig().smtpUrl) return fail("Email delivery is not configured. No access email was sent.", 503);
    const input = parsed.data;
    const result = await getDb().transaction(async (tx) => {
      const [identity] = await tx.select({ offeringId: courseRegistrations.offeringId }).from(courseRegistrations).where(eq(courseRegistrations.id, input.registrationId));
      if (!identity) return { error: "Registration not found.", status: 404 };
      const locked = await lockCourseOffering(tx, identity.offeringId);
      const [registration] = await tx.select().from(courseRegistrations).where(eq(courseRegistrations.id, input.registrationId)).for("update");
      if (!locked || locked.offering.isCancelled || !registration || !["approved", "completed"].includes(registration.status)) return { error: "Access emails require an approved registration on an uncancelled offering.", status: 409 };
      const [participant] = input.recipient === "participant" ? await tx.select().from(registrationParticipants).where(and(eq(registrationParticipants.id, input.participantId), eq(registrationParticipants.registrationId, registration.id), eq(registrationParticipants.offeringId, registration.offeringId))).for("update") : [];
      if (input.recipient === "participant" && (!participant || !["approved", "completed"].includes(participant.status))) return { error: "Approve this participant before sending access.", status: 409 };
      if (input.recipient === "coordinator" && !registration.organisationId) return { error: "This registration has no organisation coordinator.", status: 409 };
      const email = (participant?.emailNormalized || registration.applicantEmail).toLowerCase();
      const role = registration.organisationId ? (email === registration.applicantEmail.toLowerCase() ? "coordinator" as const : "participant" as const) : null;
      const [account] = await tx.select().from(user).where(eq(user.email, email)).for("share");
      const [profile] = account ? await tx.select().from(profiles).where(eq(profiles.authUserId, account.id)).for("share") : [];
      if (account && (!profile?.active || profile.role !== "customer")) return { error: "This email does not belong to an active student account. Resolve the account first.", status: 409 };
      if (participant?.profileId && participant.profileId !== profile?.id) return { error: "The participant is linked to a different account. Resolve the account first.", status: 409 };
      const [membership] = registration.organisationId && profile ? await tx.select().from(organisationMemberships).where(and(eq(organisationMemberships.organisationId, registration.organisationId), eq(organisationMemberships.profileId, profile.id))).for("share") : [];
      const linked = account?.emailVerified && profile && (!participant || participant.profileId === profile.id) && (!role || (membership && (role !== "coordinator" || membership.role === "coordinator")));
      const recipientKey = `${registration.id}:${participant?.id || "coordinator"}`;
      const [recent] = await tx.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.action, "course.access_email_requested"), eq(auditLogs.entityId, recipientKey), gte(auditLogs.createdAt, new Date(Date.now() - 60_000)))).limit(1);
      if (recent) return { error: "Access was recently requested for this recipient. Wait one minute before retrying.", status: 429 };
      const now = new Date();
      await tx.update(accountInvitations).set({ revokedAt: now }).where(and(eq(accountInvitations.registrationId, registration.id), participant ? eq(accountInvitations.participantId, participant.id) : isNull(accountInvitations.participantId), isNull(accountInvitations.acceptedAt), isNull(accountInvitations.revokedAt)));
      const token = linked ? null : randomBytes(32).toString("base64url");
      if (token) await tx.insert(accountInvitations).values({ registrationId: registration.id, participantId: participant?.id || null, organisationRole: role, email, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(now.getTime() + 7 * 86400000) });
      await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.access_email_requested", entityType: "course_registration_recipient", entityId: recipientKey, metadata: { registrationId: registration.id, participantId: participant?.id || null, mode: token ? "activation" : "login" } });
      return { email, name: participant?.name || registration.applicantName, token };
    });
    if ("error" in result) return fail(result.error!, result.status!);
    const baseUrl = process.env.COURSE_PORTAL_URL || new URL(request.url).origin;
    const link = result.token ? `${baseUrl}/portal/activate?token=${encodeURIComponent(result.token)}` : `${baseUrl}/portal/login`;
    const delivery = await sendCourseMail({ to: result.email, subject: "Your CH Elevate course portal access", text: `Hello ${result.name},\n\n${result.token ? "Activate your approved course portal access within 7 days. Use this latest link; older unused invitations have been replaced." : "Your course portal access is ready. Sign in to your existing account."}\n${link}\n\nCH Elevate` }).catch(() => ({ delivered: false }));
    if (!delivery.delivered) return fail("The access email was not delivered. Check email delivery and retry in one minute. The registration decision is unchanged.", 503);
    return Response.json({ ok: true, message: "Access email sent. The registration decision is unchanged." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
