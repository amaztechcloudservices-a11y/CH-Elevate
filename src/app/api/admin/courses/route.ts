import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, like, sql } from "drizzle-orm";
import { z } from "zod";

import {
  accountInvitations, auditLogs, courseCertificates, courseMaterials, courseOfferings, coursePaymentRecords,
  courseRegistrations, courses, organisationMemberships, organisations, profiles, registrationParticipants, user,
} from "@/db/schema";
import { canMarkCompleted, canTransitionPayment, decideApprovalStatus, isCertificateEligible, type RegistrationStatus } from "@/lib/courses";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { sendCourseMail } from "@/server/course-mail";
import { getDb } from "@/server/db";

const courseSchema = z.object({ kind: z.literal("course"), title: z.string().trim().min(3).max(180), slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), summary: z.string().trim().min(10).max(500), description: z.string().trim().min(10).max(5000), isActive: z.boolean().default(true) });
const offeringSchema = z.object({
  kind: z.literal("offering"), courseId: z.uuid(), code: z.string().trim().min(2).max(50), startsAt: z.coerce.date(), endsAt: z.coerce.date(),
  deliveryMode: z.enum(["in_person", "virtual", "blended"]), venue: z.string().trim().max(300).optional().default(""), joiningInstructions: z.string().trim().max(2000).optional().default(""),
  feeCents: z.number().int().min(0), currency: z.string().trim().length(3).default("JMD"), capacityMode: z.enum(["unlimited", "soft", "hard"]), capacity: z.number().int().positive().nullable(),
  registrationOpensAt: z.coerce.date().nullable(), registrationClosesAt: z.coerce.date().nullable(), substitutionCutoffAt: z.coerce.date().nullable(), isPublished: z.boolean(),
}).refine((value) => value.endsAt > value.startsAt, { message: "The end date must be after the start date." }).refine((value) => value.capacityMode === "unlimited" || value.capacity !== null, { message: "A capacity is required." });

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("registration_status"), id: z.uuid(), status: z.enum(["approved", "waitlisted", "rejected", "cancelled", "completed"]), overrideCapacity: z.boolean().default(false) }),
  z.object({ action: z.literal("payment"), id: z.uuid(), paymentStatus: z.enum(["unpaid", "invoiced", "partially_paid", "paid", "waived", "refunded"]), paymentReference: z.string().trim().max(120).optional().default("") }),
  z.object({ action: z.literal("attendance"), participantIds: z.array(z.uuid()).min(1), attendance: z.enum(["not_recorded", "attended", "partially_attended", "no_show"]), complete: z.boolean().default(false) }),
  z.object({ action: z.literal("certificate"), participantId: z.uuid() }),
  z.object({ action: z.literal("archive_material"), id: z.uuid(), archived: z.boolean() }),
  z.object({ action: z.literal("course_active"), id: z.uuid(), active: z.boolean() }),
  z.object({ action: z.literal("offering_published"), id: z.uuid(), published: z.boolean() }),
  z.object({ action: z.literal("bulk_registration_status"), ids: z.array(z.uuid()).min(1).max(100), status: z.enum(["approved", "waitlisted", "rejected", "cancelled", "completed"]), overrideCapacity: z.boolean().default(false) }),
  z.object({ action: z.literal("offering_update"), id: z.uuid(), startsAt: z.coerce.date(), endsAt: z.coerce.date(), deliveryMode: z.enum(["in_person", "virtual", "blended"]), venue: z.string().trim().max(300).optional().default(""), joiningInstructions: z.string().trim().max(2000).optional().default(""), feeCents: z.number().int().min(0), currency: z.string().trim().length(3), capacityMode: z.enum(["unlimited", "soft", "hard"]), capacity: z.number().int().positive().nullable(), registrationOpensAt: z.coerce.date().nullable(), registrationClosesAt: z.coerce.date().nullable(), substitutionCutoffAt: z.coerce.date().nullable(), isPublished: z.boolean() }),
  z.object({ action: z.literal("offering_cancel"), id: z.uuid() }),
]);

export async function GET(request: Request) {
  try {
    await requireClientAdmin(request);
    const database = getDb();
    const [courseRows, offeringRows, registrationRows, materialRows, recentActivity] = await Promise.all([
      database.select().from(courses).orderBy(asc(courses.title)),
      database.select({ offering: courseOfferings, courseTitle: courses.title, approvedSeats: sql<number>`count(${registrationParticipants.id}) filter (where ${registrationParticipants.status} in ('approved','completed'))::int` }).from(courseOfferings).innerJoin(courses, eq(courses.id, courseOfferings.courseId)).leftJoin(registrationParticipants, eq(registrationParticipants.offeringId, courseOfferings.id)).groupBy(courseOfferings.id, courses.title).orderBy(asc(courseOfferings.startsAt)),
      database.select({ registration: courseRegistrations, courseTitle: courses.title, offeringCode: courseOfferings.code, startsAt: courseOfferings.startsAt, organisationName: organisations.name, participantId: registrationParticipants.id, participantName: registrationParticipants.name, participantEmail: registrationParticipants.email, participantStatus: registrationParticipants.status, attendance: registrationParticipants.attendance, completedAt: registrationParticipants.completedAt }).from(courseRegistrations).innerJoin(courseOfferings, eq(courseOfferings.id, courseRegistrations.offeringId)).innerJoin(courses, eq(courses.id, courseOfferings.courseId)).leftJoin(organisations, eq(organisations.id, courseRegistrations.organisationId)).innerJoin(registrationParticipants, eq(registrationParticipants.registrationId, courseRegistrations.id)).orderBy(desc(courseRegistrations.createdAt)),
      database.select({ material: courseMaterials, courseTitle: courses.title, offeringCode: courseOfferings.code }).from(courseMaterials).leftJoin(courses, eq(courses.id, courseMaterials.courseId)).leftJoin(courseOfferings, eq(courseOfferings.id, courseMaterials.offeringId)).orderBy(desc(courseMaterials.createdAt)),
      database.select({ id: auditLogs.id, action: auditLogs.action, entityType: auditLogs.entityType, entityId: auditLogs.entityId, createdAt: auditLogs.createdAt }).from(auditLogs).where(like(auditLogs.action, "course.%")).orderBy(desc(auditLogs.createdAt)).limit(10),
    ]);
    const pending = registrationRows.filter((row) => row.participantStatus === "pending_review").length;
    const waitlisted = registrationRows.filter((row) => row.participantStatus === "waitlisted").length;
    const outstandingCents = [...new Map(registrationRows.map((row) => [row.registration.id, row.registration])).values()].filter((row) => !["paid", "waived", "refunded"].includes(row.paymentStatus)).reduce((sum, row) => sum + row.amountDueCents, 0);
    return Response.json({ ok: true, data: { courses: courseRows, offerings: offeringRows, registrations: registrationRows, materials: materialRows, recentActivity, metrics: { pending, upcoming: offeringRows.filter((row) => row.offering.startsAt > new Date() && !row.offering.isCancelled).length, waitlisted, outstandingCents } } });
  } catch (error) { return adminErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { session } = await requireClientAdmin(request);
    const body = await request.json();
    const parsed = body.kind === "course" ? courseSchema.safeParse(body) : offeringSchema.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: { message: parsed.error.issues[0]?.message || "Invalid course data." } }, { status: 422 });
    const database = getDb();
    const [created] = parsed.data.kind === "course"
      ? await database.insert(courses).values(parsed.data).returning()
      : await database.insert(courseOfferings).values({ ...parsed.data, venue: parsed.data.venue || null, joiningInstructions: parsed.data.joiningInstructions || null, timeZone: "America/Jamaica" }).returning();
    await database.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: `course.${parsed.data.kind}_created`, entityType: parsed.data.kind, entityId: created.id });
    return Response.json({ ok: true, data: created }, { status: 201 });
  } catch (error) { return adminErrorResponse(error); }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const { session } = await requireClientAdmin(request);
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ ok: false, error: { message: parsed.error.issues[0]?.message || "Invalid update." } }, { status: 422 });
    const database = getDb();
    if (parsed.data.action === "bulk_registration_status") {
      const results: unknown[] = [];
      for (const id of [...new Set(parsed.data.ids)]) {
        const headers = new Headers(request.headers);
        headers.delete("content-length");
        headers.set("content-type", "application/json");
        const response: Response = await PATCH(new Request(request.url, { method: "PATCH", headers, body: JSON.stringify({ action: "registration_status", id, status: parsed.data.status, overrideCapacity: parsed.data.overrideCapacity }) }));
        const body = await response.json() as { data?: unknown };
        if (!response.ok) return Response.json(body, { status: response.status });
        results.push(body.data);
      }
      return Response.json({ ok: true, data: results });
    }
    if (parsed.data.action === "offering_update") {
      if (parsed.data.endsAt <= parsed.data.startsAt || (parsed.data.capacityMode !== "unlimited" && parsed.data.capacity === null)) return Response.json({ ok: false, error: { message: parsed.data.endsAt <= parsed.data.startsAt ? "The end date must be after the start date." : "A capacity is required." } }, { status: 422 });
      const [before] = await database.select().from(courseOfferings).where(eq(courseOfferings.id, parsed.data.id)).limit(1);
      if (!before || before.isCancelled) return Response.json({ ok: false, error: { message: before ? "Cancelled offerings cannot be rescheduled." : "Offering not found." } }, { status: before ? 409 : 404 });
      const changes = { startsAt: parsed.data.startsAt, endsAt: parsed.data.endsAt, deliveryMode: parsed.data.deliveryMode, venue: parsed.data.venue || null, joiningInstructions: parsed.data.joiningInstructions || null, feeCents: parsed.data.feeCents, currency: parsed.data.currency, capacityMode: parsed.data.capacityMode, capacity: parsed.data.capacity, registrationOpensAt: parsed.data.registrationOpensAt, registrationClosesAt: parsed.data.registrationClosesAt, substitutionCutoffAt: parsed.data.substitutionCutoffAt, isPublished: parsed.data.isPublished, updatedAt: new Date() };
      const [updated] = await database.update(courseOfferings).set(changes).where(eq(courseOfferings.id, parsed.data.id)).returning();
      await database.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.offering_updated", entityType: "course_offering", entityId: parsed.data.id, metadata: { previousStartsAt: before.startsAt.toISOString(), startsAt: updated.startsAt.toISOString() } });
      const recipients = await database.select({ email: courseRegistrations.applicantEmail }).from(courseRegistrations).where(eq(courseRegistrations.offeringId, parsed.data.id));
      for (const email of [...new Set(recipients.map((row) => row.email))]) await sendCourseMail({ to: email, subject: "CH Elevate course schedule updated", text: `The schedule or delivery details for your course have changed. The course now begins ${updated.startsAt.toLocaleString("en-JM", { timeZone: updated.timeZone })}. Sign in to your portal for the latest venue or joining instructions.` });
      return Response.json({ ok: true, data: updated });
    }
    if (parsed.data.action === "offering_cancel") {
      const offeringId = parsed.data.id;
      const [cancelled] = await database.transaction(async (tx) => {
        const rows = await tx.update(courseOfferings).set({ isCancelled: true, isPublished: false, updatedAt: new Date() }).where(eq(courseOfferings.id, offeringId)).returning();
        if (!rows[0]) return rows;
        await tx.update(courseRegistrations).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(courseRegistrations.offeringId, offeringId), inArray(courseRegistrations.status, ["pending_review", "approved", "waitlisted"])));
        await tx.update(registrationParticipants).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(registrationParticipants.offeringId, offeringId), inArray(registrationParticipants.status, ["pending_review", "approved", "waitlisted"])));
        await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.offering_cancelled", entityType: "course_offering", entityId: offeringId });
        return rows;
      });
      if (!cancelled) return Response.json({ ok: false, error: { message: "Offering not found." } }, { status: 404 });
      const recipients = await database.select({ email: courseRegistrations.applicantEmail }).from(courseRegistrations).where(eq(courseRegistrations.offeringId, offeringId));
      for (const email of [...new Set(recipients.map((row) => row.email))]) await sendCourseMail({ to: email, subject: "CH Elevate course cancelled", text: "This scheduled course offering has been cancelled. Please contact CH Elevate if you need help with another date or any offline payment arrangements." });
      return Response.json({ ok: true, data: cancelled });
    }
    if (parsed.data.action === "payment") {
      const [existing] = await database.select().from(courseRegistrations).where(eq(courseRegistrations.id, parsed.data.id)).limit(1);
      if (!existing) return Response.json({ ok: false, error: { message: "Registration not found." } }, { status: 404 });
      if (!canTransitionPayment(existing.paymentStatus, parsed.data.paymentStatus)) return Response.json({ ok: false, error: { message: `Payment cannot move directly from ${existing.paymentStatus.replaceAll("_", " ")} to ${parsed.data.paymentStatus.replaceAll("_", " ")}.` } }, { status: 409 });
      const [updated] = await database.update(courseRegistrations).set({ paymentStatus: parsed.data.paymentStatus, paymentReference: parsed.data.paymentReference || null, updatedAt: new Date() }).where(eq(courseRegistrations.id, parsed.data.id)).returning();
      if (updated) await database.insert(coursePaymentRecords).values({ registrationId: updated.id, status: parsed.data.paymentStatus, amountCents: updated.amountDueCents, reference: parsed.data.paymentReference || null, recordedByAuthUserId: session.user.id });
      await database.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.payment_updated", entityType: "course_registration", entityId: parsed.data.id, metadata: { status: parsed.data.paymentStatus } });
      if (updated) await sendCourseMail({ to: updated.applicantEmail, subject: "CH Elevate payment status updated", text: `Your course registration payment status is now: ${parsed.data.paymentStatus.replaceAll("_", " ")}.` });
      return Response.json({ ok: true, data: updated });
    }
    if (parsed.data.action === "attendance") {
      if (parsed.data.complete && !canMarkCompleted(parsed.data.attendance)) return Response.json({ ok: false, error: { message: "Only attended participants can be marked complete." } }, { status: 422 });
      const existingParticipants = await database.select({ id: registrationParticipants.id }).from(registrationParticipants).where(inArray(registrationParticipants.id, parsed.data.participantIds));
      if (existingParticipants.length !== new Set(parsed.data.participantIds).size) return Response.json({ ok: false, error: { message: "One or more participants were not found." } }, { status: 404 });
      const completedAt = parsed.data.complete ? new Date() : null;
      await database.update(registrationParticipants).set({ attendance: parsed.data.attendance, completedAt, status: parsed.data.complete ? "completed" : undefined, updatedAt: new Date() }).where(inArray(registrationParticipants.id, parsed.data.participantIds));
      await database.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.attendance_updated", entityType: "registration_participant", metadata: { ids: parsed.data.participantIds, attendance: parsed.data.attendance, complete: parsed.data.complete } });
      return Response.json({ ok: true });
    }
    if (parsed.data.action === "certificate") {
      const [row] = await database.select({ participant: registrationParticipants, courseTitle: courses.title }).from(registrationParticipants).innerJoin(courseOfferings, eq(courseOfferings.id, registrationParticipants.offeringId)).innerJoin(courses, eq(courses.id, courseOfferings.courseId)).where(eq(registrationParticipants.id, parsed.data.participantId)).limit(1);
      if (!row || !isCertificateEligible(row.participant.attendance, row.participant.completedAt)) return Response.json({ ok: false, error: { message: "Only completed attendees can receive a certificate." } }, { status: 409 });
      const certificateNumber = `CHE-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const [certificate] = await database.insert(courseCertificates).values({ participantId: row.participant.id, certificateNumber, participantName: row.participant.name, courseTitle: row.courseTitle, completedAt: row.participant.completedAt! }).onConflictDoUpdate({ target: courseCertificates.participantId, set: { revokedAt: null } }).returning();
      await database.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.certificate_issued", entityType: "course_certificate", entityId: certificate.id });
      await sendCourseMail({ to: row.participant.email, subject: "Your CH Elevate certificate is ready", text: `Your certificate for ${row.courseTitle} is now available in your client portal.` });
      return Response.json({ ok: true, data: certificate });
    }
    if (parsed.data.action === "archive_material") {
      const [material] = await database.update(courseMaterials).set({ isArchived: parsed.data.archived }).where(eq(courseMaterials.id, parsed.data.id)).returning();
      await database.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.material_archived", entityType: "course_material", entityId: parsed.data.id, metadata: { archived: parsed.data.archived } });
      return Response.json({ ok: true, data: material });
    }
    if (parsed.data.action === "course_active") {
      const [course] = await database.update(courses).set({ isActive: parsed.data.active, updatedAt: new Date() }).where(eq(courses.id, parsed.data.id)).returning();
      await database.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.active_updated", entityType: "course", entityId: parsed.data.id, metadata: { active: parsed.data.active } });
      return Response.json({ ok: true, data: course });
    }
    if (parsed.data.action === "offering_published") {
      const [offering] = await database.update(courseOfferings).set({ isPublished: parsed.data.published, updatedAt: new Date() }).where(eq(courseOfferings.id, parsed.data.id)).returning();
      await database.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.offering_published_updated", entityType: "course_offering", entityId: parsed.data.id, metadata: { published: parsed.data.published } });
      return Response.json({ ok: true, data: offering });
    }

    if (parsed.data.action !== "registration_status") {
      return Response.json({ ok: false, error: { message: "Unsupported course update." } }, { status: 422 });
    }
    const statusUpdate = parsed.data;

    const result = await database.transaction(async (tx) => {
      const [registration] = await tx.select().from(courseRegistrations).where(eq(courseRegistrations.id, statusUpdate.id)).limit(1);
      if (!registration) return { error: "Registration not found." as const };
      if (registration.status === "approved" && statusUpdate.status === "approved") return { updated: registration, invitations: [], finalStatus: "approved" as const };
      let finalStatus: RegistrationStatus = statusUpdate.status;
      if (statusUpdate.status === "approved") {
        await tx.execute(sql`select id from ${courseOfferings} where ${courseOfferings.id} = ${registration.offeringId} for update`);
        const [offering] = await tx.select().from(courseOfferings).where(eq(courseOfferings.id, registration.offeringId)).limit(1);
        const [seatCount] = await tx.select({ value: count() }).from(registrationParticipants).where(and(eq(registrationParticipants.offeringId, registration.offeringId), inArray(registrationParticipants.status, ["approved", "completed"])));
        const [requestCount] = await tx.select({ value: count() }).from(registrationParticipants).where(eq(registrationParticipants.registrationId, registration.id));
        const [firstWaitlisted] = registration.status === "waitlisted" && !statusUpdate.overrideCapacity
          ? await tx.select({ id: courseRegistrations.id }).from(courseRegistrations).where(and(eq(courseRegistrations.offeringId, registration.offeringId), eq(courseRegistrations.status, "waitlisted"))).orderBy(asc(courseRegistrations.createdAt), asc(courseRegistrations.id)).limit(1)
          : [];
        finalStatus = firstWaitlisted && firstWaitlisted.id !== registration.id
          ? "waitlisted"
          : decideApprovalStatus({ capacityMode: offering.capacityMode, capacity: offering.capacity, approvedSeats: seatCount.value, requestedSeats: requestCount.value, override: statusUpdate.overrideCapacity });
      }
      const now = new Date();
      const [updated] = await tx.update(courseRegistrations).set({ status: finalStatus, approvedAt: finalStatus === "approved" ? now : registration.approvedAt, updatedAt: now }).where(eq(courseRegistrations.id, registration.id)).returning();
      const participants = await tx.update(registrationParticipants).set({ status: finalStatus, updatedAt: now }).where(eq(registrationParticipants.registrationId, registration.id)).returning();
      const invitations: { email: string; token: string | null; name: string }[] = [];
      if (finalStatus === "approved") {
        for (const participant of participants) {
          const [existingAccount] = await tx.select({ profileId: profiles.id }).from(user).innerJoin(profiles, eq(profiles.authUserId, user.id)).where(eq(user.email, participant.emailNormalized)).limit(1);
          if (existingAccount) {
            await tx.update(registrationParticipants).set({ profileId: existingAccount.profileId, updatedAt: now }).where(eq(registrationParticipants.id, participant.id));
            if (registration.organisationId) await tx.insert(organisationMemberships).values({ organisationId: registration.organisationId, profileId: existingAccount.profileId, role: participant.emailNormalized === registration.applicantEmail.toLowerCase() ? "coordinator" : "participant" }).onConflictDoNothing();
            invitations.push({ email: participant.email, token: null, name: participant.name });
            continue;
          }
          const token = randomBytes(32).toString("base64url");
          await tx.insert(accountInvitations).values({ registrationId: registration.id, participantId: participant.id, email: participant.email, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7 * 86400000), organisationRole: registration.organisationId && participant.emailNormalized === registration.applicantEmail.toLowerCase() ? "coordinator" : registration.organisationId ? "participant" : null });
          invitations.push({ email: participant.email, token, name: participant.name });
        }
        if (registration.organisationId && !participants.some((participant) => participant.emailNormalized === registration.applicantEmail.toLowerCase())) {
          const [existingCoordinator] = await tx.select({ profileId: profiles.id }).from(user).innerJoin(profiles, eq(profiles.authUserId, user.id)).where(eq(user.email, registration.applicantEmail.toLowerCase())).limit(1);
          if (existingCoordinator) {
            await tx.insert(organisationMemberships).values({ organisationId: registration.organisationId, profileId: existingCoordinator.profileId, role: "coordinator" }).onConflictDoNothing();
            invitations.push({ email: registration.applicantEmail, token: null, name: registration.applicantName });
          } else {
            const token = randomBytes(32).toString("base64url");
            await tx.insert(accountInvitations).values({ registrationId: registration.id, email: registration.applicantEmail, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7 * 86400000), organisationRole: "coordinator" });
            invitations.push({ email: registration.applicantEmail, token, name: registration.applicantName });
          }
        }
      }
      await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.registration_status_updated", entityType: "course_registration", entityId: registration.id, metadata: { requested: statusUpdate.status, applied: finalStatus, override: statusUpdate.overrideCapacity } });
      return { updated, invitations, finalStatus };
    });
    if ("error" in result) return Response.json({ ok: false, error: { message: result.error } }, { status: 404 });
    const baseUrl = process.env.COURSE_PORTAL_URL || new URL(request.url).origin;
    for (const invitation of result.invitations) await sendCourseMail({ to: invitation.email, subject: "Your CH Elevate course registration is approved", text: invitation.token ? `Hello ${invitation.name},\n\nYour registration is approved. Activate your portal account within 7 days:\n${baseUrl}/portal/activate?token=${encodeURIComponent(invitation.token)}\n\nCH Elevate` : `Hello ${invitation.name},\n\nYour registration is approved and has been linked to your existing account. Sign in here:\n${baseUrl}/portal/login\n\nCH Elevate` });
    if (result.finalStatus !== "approved") await sendCourseMail({ to: result.updated.applicantEmail, subject: `CH Elevate registration ${result.finalStatus.replaceAll("_", " ")}`, text: `Your course registration status is now: ${result.finalStatus.replaceAll("_", " ")}.` });
    return Response.json({ ok: true, data: { ...result.updated, status: result.finalStatus } });
  } catch (error) { return adminErrorResponse(error); }
}
