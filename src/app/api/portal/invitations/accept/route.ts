import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";

import { accountInvitations, auditLogs, courseRegistrations, organisationMemberships, profiles, registrationParticipants, user } from "@/db/schema";
import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db";
import { lockCourseOffering } from "@/server/course-enrolment";

const schema = z.object({ token: z.string().min(20).max(200) }).strict();
const fail = (error: string, status: number) => Response.json({ ok: false, error }, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  try {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return fail("Create or sign in to your account first.", 401);
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("A same-origin request is required.", 403);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Invalid invitation.", 422);
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const database = getDb();
  const result = await database.transaction(async (tx) => {
    const [identity] = await tx.select({ registrationId: accountInvitations.registrationId }).from(accountInvitations).where(eq(accountInvitations.tokenHash, tokenHash));
    if (!identity?.registrationId) return null;
    const [target] = await tx.select({ offeringId: courseRegistrations.offeringId }).from(courseRegistrations).where(eq(courseRegistrations.id, identity.registrationId));
    if (!target) return null;
    // Match the approval/replacement lock order before claiming the invitation.
    const locked = await lockCourseOffering(tx, target.offeringId);
    if (!locked || locked.offering.isCancelled) return null;
    const [registration] = await tx.select().from(courseRegistrations).where(eq(courseRegistrations.id, identity.registrationId)).for("update");
    if (!registration || !["approved", "completed"].includes(registration.status)) return null;
    const [invitation] = await tx.select().from(accountInvitations).where(and(eq(accountInvitations.tokenHash, tokenHash), eq(accountInvitations.registrationId, registration.id), gt(accountInvitations.expiresAt, new Date()), isNull(accountInvitations.acceptedAt), isNull(accountInvitations.revokedAt))).for("update");
    const email = session.user.email.toLowerCase();
    if (!invitation || invitation.email.toLowerCase() !== email) return null;
    const [account] = await tx.select({ id: user.id, email: user.email }).from(user).where(eq(user.id, session.user.id)).for("update");
    if (!account || account.email.toLowerCase() !== email) return null;
    const [profile] = await tx.select().from(profiles).where(eq(profiles.authUserId, session.user.id)).for("share");
    if (!profile?.active || profile.role !== "customer") return null;
    const role = registration.organisationId ? (registration.applicantEmail.toLowerCase() === email ? "coordinator" : "participant") : null;
    if (invitation.organisationRole !== role || (!invitation.participantId && role !== "coordinator")) return null;
    if (invitation.participantId) {
      const [participant] = await tx.select().from(registrationParticipants).where(and(eq(registrationParticipants.id, invitation.participantId), eq(registrationParticipants.registrationId, registration.id), eq(registrationParticipants.offeringId, registration.offeringId))).for("update");
      if (!participant || participant.emailNormalized !== email || !["approved", "completed"].includes(participant.status) || (participant.profileId && participant.profileId !== profile.id)) return null;
      await tx.update(registrationParticipants).set({ profileId: profile.id, updatedAt: new Date() }).where(eq(registrationParticipants.id, participant.id));
    }
    if (registration.organisationId && role) {
      const insert = tx.insert(organisationMemberships).values({ organisationId: registration.organisationId, profileId: profile.id, role });
      if (role === "coordinator") await insert.onConflictDoUpdate({ target: [organisationMemberships.organisationId, organisationMemberships.profileId], set: { role } });
      else await insert.onConflictDoNothing();
    }
    await tx.update(accountInvitations).set({ acceptedAt: new Date() }).where(eq(accountInvitations.id, invitation.id));
    // The single-use invitation sent to this address proves ownership of the signed-in account's email.
    await tx.update(user).set({ emailVerified: true, updatedAt: new Date() }).where(eq(user.id, account.id));
    await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.invitation_accepted", entityType: "account_invitation", entityId: invitation.id });
    return true;
  });
  if (!result) return fail("This invitation is invalid, expired, no longer approved, or belongs to another email address.", 409);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return fail("The invitation could not be accepted. Please try again.", 500); }
}
