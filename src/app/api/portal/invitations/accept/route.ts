import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";

import { accountInvitations, auditLogs, courseRegistrations, organisationMemberships, profiles, registrationParticipants } from "@/db/schema";
import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db";

const schema = z.object({ token: z.string().min(20).max(200) });

export async function POST(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return Response.json({ ok: false, error: "Create or sign in to your account first." }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ ok: false, error: "Invalid invitation." }, { status: 422 });
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const database = getDb();
  const result = await database.transaction(async (tx) => {
    const [invitation] = await tx.select().from(accountInvitations).where(and(eq(accountInvitations.tokenHash, tokenHash), gt(accountInvitations.expiresAt, new Date()), isNull(accountInvitations.acceptedAt), isNull(accountInvitations.revokedAt))).limit(1);
    if (!invitation || invitation.email.toLowerCase() !== session.user.email.toLowerCase()) return null;
    const [profile] = await tx.select().from(profiles).where(eq(profiles.authUserId, session.user.id)).limit(1);
    if (!profile?.active || profile.role !== "customer") return null;
    if (invitation.participantId) await tx.update(registrationParticipants).set({ profileId: profile.id, updatedAt: new Date() }).where(eq(registrationParticipants.id, invitation.participantId));
    if (invitation.registrationId && invitation.organisationRole) {
      const [registration] = await tx.select({ organisationId: courseRegistrations.organisationId }).from(courseRegistrations).where(eq(courseRegistrations.id, invitation.registrationId)).limit(1);
      if (registration?.organisationId) await tx.insert(organisationMemberships).values({ organisationId: registration.organisationId, profileId: profile.id, role: invitation.organisationRole }).onConflictDoNothing();
    }
    await tx.update(accountInvitations).set({ acceptedAt: new Date() }).where(eq(accountInvitations.id, invitation.id));
    await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.invitation_accepted", entityType: "account_invitation", entityId: invitation.id });
    return profile;
  });
  if (!result) return Response.json({ ok: false, error: "This invitation is invalid, expired, or belongs to another email address." }, { status: 409 });
  return Response.json({ ok: true });
}
