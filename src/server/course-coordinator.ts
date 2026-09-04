import { and, count, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { accountInvitations, auditLogs, courseCertificates, coursePaymentRecords, courseRegistrations, organisationMemberships, profiles, registrationParticipants } from "@/db/schema";
import { participantInputSchema, isSubstitutionOpen } from "@/lib/courses";
import { getDb } from "@/server/db";
import { lockCourseOffering } from "@/server/course-enrolment";

export const addParticipantSchema = participantInputSchema.extend({ action: z.literal("add_participant"), registrationId: z.uuid() }).strict();
export const replaceParticipantSchema = participantInputSchema.extend({ action: z.literal("replace_participant"), participantId: z.uuid(), updatedAt: z.iso.datetime() }).strict();
type Change = z.infer<typeof addParticipantSchema> | z.infer<typeof replaceParticipantSchema>;
export class CoordinatorChangeError extends Error { constructor(message: string, public status: number) { super(message); } }

export async function changeCoordinatorParticipant(input: Change, actor: { profileId: string; authUserId: string }) {
  if (/[\x00-\x1f\x7f]/.test(`${input.name}${input.phone}`)) throw new CoordinatorChangeError("Participant details cannot contain control characters.", 422);
  return getDb().transaction(async (tx) => {
    const [identity] = input.action === "add_participant"
      ? await tx.select({ id: courseRegistrations.id, offeringId: courseRegistrations.offeringId }).from(courseRegistrations).where(eq(courseRegistrations.id, input.registrationId))
      : await tx.select({ id: registrationParticipants.registrationId, offeringId: registrationParticipants.offeringId }).from(registrationParticipants).where(eq(registrationParticipants.id, input.participantId));
    if (!identity) throw new CoordinatorChangeError("Registration not found.", 404);
    const locked = await lockCourseOffering(tx, identity.offeringId);
    const [registration] = await tx.select().from(courseRegistrations).where(eq(courseRegistrations.id, identity.id)).for("update");
    if (!locked || !registration?.organisationId) throw new CoordinatorChangeError("Organisation registration not found.", 404);
    const [profile] = await tx.select().from(profiles).where(eq(profiles.id, actor.profileId)).for("share");
    const [membership] = await tx.select().from(organisationMemberships).where(and(eq(organisationMemberships.profileId, actor.profileId), eq(organisationMemberships.organisationId, registration.organisationId), eq(organisationMemberships.role, "coordinator"))).for("share");
    if (!profile?.active || profile.role !== "customer" || !membership) throw new CoordinatorChangeError("Coordinator access is required.", 403);
    const now = new Date();
    if (locked.offering.isCancelled || !["pending_review", "approved", "waitlisted"].includes(registration.status)) throw new CoordinatorChangeError("This registration no longer accepts participant changes.", 409);
    if (locked.offering.startsAt <= now || !isSubstitutionOpen(locked.offering.substitutionCutoffAt, now)) throw new CoordinatorChangeError("The participant change cutoff has passed.", 409);
    const [previous] = input.action === "replace_participant" ? await tx.select().from(registrationParticipants).where(and(eq(registrationParticipants.id, input.participantId), eq(registrationParticipants.registrationId, registration.id), eq(registrationParticipants.offeringId, locked.offering.id))).for("update") : [];
    if (input.action === "replace_participant") {
      if (!previous) throw new CoordinatorChangeError("Participant not found.", 404);
      if (previous.updatedAt.toISOString() !== input.updatedAt) throw new CoordinatorChangeError("This participant changed. Refresh the roster before replacing them.", 409);
      if (!["pending_review", "approved", "waitlisted"].includes(previous.status)) throw new CoordinatorChangeError("Completed, cancelled or rejected participants cannot be replaced.", 409);
      if (previous.emailNormalized === input.email) throw new CoordinatorChangeError("Use a different email address for the replacement participant.", 422);
    } else {
      const [size] = await tx.select({ value: count() }).from(registrationParticipants).where(eq(registrationParticipants.registrationId, registration.id));
      if (size.value >= 250) throw new CoordinatorChangeError("A registration can contain at most 250 participants.", 409);
    }
    const [duplicate] = await tx.select({ id: registrationParticipants.id }).from(registrationParticipants).where(and(eq(registrationParticipants.offeringId, registration.offeringId), eq(registrationParticipants.emailNormalized, input.email), previous ? ne(registrationParticipants.id, previous.id) : undefined));
    if (duplicate) throw new CoordinatorChangeError("That email is already registered for this offering.", 409);
    const updatedAt = new Date(Math.max(now.getTime(), (previous?.updatedAt.getTime() ?? 0) + 1));
    const nextAmountDueCents = registration.amountDueCents + (previous ? 0 : locked.offering.feeCents);
    if (!Number.isSafeInteger(nextAmountDueCents) || nextAmountDueCents < 0 || nextAmountDueCents > 2147483647) throw new CoordinatorChangeError("The additional seat would exceed the supported registration total.", 409);
    const nextPaymentStatus = previous ? registration.paymentStatus : registration.paymentStatus === "paid" ? "partially_paid" as const : registration.paymentStatus === "invoiced" || registration.paymentStatus === "refunded" ? "unpaid" as const : registration.paymentStatus;
    const values = { name: input.name, email: input.email, emailNormalized: input.email, phone: input.phone || null, status: "pending_review" as const, profileId: null, attendance: "not_recorded" as const, completedAt: null, cancellationRequestedAt: null, updatedAt };
    const [participant] = previous
      ? await tx.update(registrationParticipants).set(values).where(eq(registrationParticipants.id, previous.id)).returning()
      : await tx.insert(registrationParticipants).values({ ...values, registrationId: registration.id, offeringId: registration.offeringId }).returning();
    if (previous) {
      await tx.update(accountInvitations).set({ revokedAt: now }).where(and(eq(accountInvitations.participantId, previous.id), isNull(accountInvitations.revokedAt)));
      const revoked = await tx.update(courseCertificates).set({ revokedAt: now }).where(and(eq(courseCertificates.participantId, previous.id), isNull(courseCertificates.revokedAt))).returning({ id: courseCertificates.id });
      for (const certificate of revoked) await tx.insert(auditLogs).values({ actorAuthUserId: actor.authUserId, action: "course.certificate_revoked", entityType: "course_certificate", entityId: certificate.id, metadata: { reason: "participant_replaced" } });
    } else {
      await tx.update(courseRegistrations).set({ amountDueCents: nextAmountDueCents, paymentStatus: nextPaymentStatus, updatedAt: now }).where(eq(courseRegistrations.id, registration.id));
      if (nextPaymentStatus !== registration.paymentStatus) await tx.insert(coursePaymentRecords).values({ registrationId: registration.id, status: nextPaymentStatus, amountCents: nextAmountDueCents, reference: registration.paymentReference, notes: "Payment status adjusted after an additional seat was added.", recordedByAuthUserId: actor.authUserId });
    }
    await tx.insert(auditLogs).values({ actorAuthUserId: actor.authUserId, action: `course.participant_${previous ? "replaced" : "added"}`, entityType: "registration_participant", entityId: participant.id, metadata: previous ? { previousParticipant: previous } : { seatFeeCents: locked.offering.feeCents, previousAmountDueCents: registration.amountDueCents, amountDueCents: nextAmountDueCents, previousPaymentStatus: registration.paymentStatus, paymentStatus: nextPaymentStatus } });
    return { id: participant.id, registrationId: participant.registrationId, name: participant.name, email: participant.email, status: participant.status, updatedAt: participant.updatedAt };
  });
}
