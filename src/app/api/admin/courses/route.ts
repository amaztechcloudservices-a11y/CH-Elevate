import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNull, like, ne, sql } from "drizzle-orm";
import { z } from "zod";

import {
  accountInvitations, auditLogs, courseCertificates, courseMaterials, courseOfferings, coursePaymentRecords,
  courseRegistrations, courses, organisationMemberships, organisations, profiles, registrationParticipants, user,
} from "@/db/schema";
import { canMarkCompleted, canTransitionPayment, decideApprovalStatus, isCertificateEligible, type RegistrationStatus } from "@/lib/courses";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { sendCourseMail } from "@/server/course-mail";
import { getDb } from "@/server/db";
import { courseEnrolmentCount, lockCourseOffering } from "@/server/course-enrolment";

const offeringDate = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
function scheduleIsValid(value: { startsAt: Date; registrationOpensAt: Date | null; registrationClosesAt: Date | null; substitutionCutoffAt: Date | null }) {
  return (!value.registrationOpensAt || value.registrationOpensAt <= value.startsAt)
    && (!value.registrationClosesAt || value.registrationClosesAt <= value.startsAt)
    && (!value.registrationOpensAt || !value.registrationClosesAt || value.registrationOpensAt <= value.registrationClosesAt)
    && (!value.substitutionCutoffAt || value.substitutionCutoffAt <= value.startsAt);
}
const offeringSchema = z.object({
  kind: z.literal("offering"), courseId: z.uuid(), code: z.string().trim().min(2).max(50), startsAt: offeringDate, endsAt: offeringDate,
  deliveryMode: z.enum(["in_person", "virtual", "blended"]), venue: z.string().trim().max(300).optional().default(""), joiningInstructions: z.string().trim().max(2000).optional().default(""),
  feeCents: z.number().int().min(0).max(2147483647), currency: z.enum(["JMD", "USD", "GBP", "EUR", "CAD"]).default("JMD"), capacityMode: z.enum(["unlimited", "soft", "hard"]), capacity: z.number().int().positive().max(2147483647).nullable(),
  registrationOpensAt: offeringDate.nullable(), registrationClosesAt: offeringDate.nullable(), substitutionCutoffAt: offeringDate.nullable(), isPublished: z.boolean(),
}).strict().refine(scheduleIsValid, { message: "Registration and substitution dates must be in order and no later than the course starts." }).refine((value) => value.endsAt > value.startsAt, { message: "The end date must be after the start date." }).refine((value) => value.capacityMode === "unlimited" || value.capacity !== null, { message: "A capacity is required." });

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("registration_status"), id: z.uuid(), participantId: z.uuid().optional(), status: z.enum(["approved", "waitlisted", "rejected", "cancelled", "completed"]), overrideCapacity: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal("payment"), id: z.uuid(), paymentStatus: z.enum(["unpaid", "invoiced", "partially_paid", "paid", "waived", "refunded"]), paymentReference: z.string().trim().max(120).optional().default("") }).strict(),
  z.object({ action: z.literal("attendance"), participantIds: z.array(z.uuid()).min(1).max(1000), attendance: z.enum(["not_recorded", "attended", "partially_attended", "no_show"]), complete: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal("certificate"), participantId: z.uuid() }).strict(),
  z.object({ action: z.literal("archive_material"), id: z.uuid(), archived: z.boolean() }).strict(),
  z.object({ action: z.literal("course_active"), id: z.uuid(), active: z.boolean() }).strict(),
  z.object({ action: z.literal("offering_published"), id: z.uuid(), published: z.boolean() }).strict(),
  z.object({ action: z.literal("bulk_registration_status"), ids: z.array(z.uuid()).min(1).max(100), status: z.enum(["approved", "waitlisted", "rejected", "cancelled", "completed"]), overrideCapacity: z.boolean().default(false) }).strict(),
  z.object({ action: z.literal("offering_update"), id: z.uuid(), updatedAt: z.iso.datetime(), startsAt: offeringDate, endsAt: offeringDate, deliveryMode: z.enum(["in_person", "virtual", "blended"]), venue: z.string().trim().max(300).optional().default(""), joiningInstructions: z.string().trim().max(2000).optional().default(""), feeCents: z.number().int().min(0).max(2147483647), currency: z.enum(["JMD", "USD", "GBP", "EUR", "CAD"]), capacityMode: z.enum(["unlimited", "soft", "hard"]), capacity: z.number().int().positive().max(2147483647).nullable(), registrationOpensAt: offeringDate.nullable(), registrationClosesAt: offeringDate.nullable(), substitutionCutoffAt: offeringDate.nullable(), isPublished: z.boolean() }).strict().refine(scheduleIsValid, { message: "Registration and substitution dates must be in order and no later than the course starts." }),
  z.object({ action: z.literal("offering_cancel"), id: z.uuid() }).strict(),
]);

export async function GET(request: Request) {
  try {
    await requireClientAdmin(request);
    const database = getDb();
    const [courseRows, offeringRows, registrationRows, materialRows, recentActivity] = await Promise.all([
      database.select().from(courses).orderBy(asc(courses.title)),
      database.select({ offering: courseOfferings, courseTitle: courses.title, approvedSeats: sql<number>`count(${registrationParticipants.id}) filter (where ${registrationParticipants.status} in ('approved','completed'))::int` }).from(courseOfferings).innerJoin(courses, eq(courses.id, courseOfferings.courseId)).leftJoin(registrationParticipants, eq(registrationParticipants.offeringId, courseOfferings.id)).groupBy(courseOfferings.id, courses.title).orderBy(asc(courseOfferings.startsAt)),
      database.select({ registration: courseRegistrations, courseTitle: courses.title, offeringCode: courseOfferings.code, currency: courseOfferings.currency, startsAt: courseOfferings.startsAt, organisationName: organisations.name, participantProfileId: registrationParticipants.profileId, courseId: courses.id, offeringId: courseOfferings.id, participantId: registrationParticipants.id, participantName: registrationParticipants.name, participantEmail: registrationParticipants.email, participantStatus: registrationParticipants.status, attendance: registrationParticipants.attendance, completedAt: registrationParticipants.completedAt }).from(courseRegistrations).innerJoin(courseOfferings, eq(courseOfferings.id, courseRegistrations.offeringId)).innerJoin(courses, eq(courses.id, courseOfferings.courseId)).leftJoin(organisations, eq(organisations.id, courseRegistrations.organisationId)).innerJoin(registrationParticipants, eq(registrationParticipants.registrationId, courseRegistrations.id)).orderBy(desc(courseRegistrations.createdAt)),
      database.select({ material: courseMaterials, courseTitle: courses.title, offeringCode: courseOfferings.code, recipientName: profiles.displayName, recipientEmail: user.email }).from(courseMaterials).leftJoin(courses, eq(courses.id, courseMaterials.courseId)).leftJoin(courseOfferings, eq(courseOfferings.id, courseMaterials.offeringId)).leftJoin(profiles, eq(profiles.id, courseMaterials.recipientProfileId)).leftJoin(user, eq(user.id, profiles.authUserId)).orderBy(desc(courseMaterials.createdAt)),
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
    if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ ok: false, error: { message: "A same-origin request is required." } }, { status: 403 });
    const body = await request.json().catch(() => null);
    if (body?.kind === "course") return Response.json({ ok: false, error: { message: "Use Add New Course in the course catalogue to create and publish a course." } }, { status: 409 });
    const parsed = offeringSchema.safeParse(body);
    if (!parsed.success) return Response.json({ ok: false, error: { message: parsed.error.issues[0]?.message || "Invalid course data." } }, { status: 422 });
    const database = getDb();
    const result = await database.transaction(async (tx) => {
      const [course] = await tx.select().from(courses).where(eq(courses.id, parsed.data.courseId)).for("update");
      if (!course) return Response.json({ ok: false, error: { message: "Course not found." } }, { status: 404 });
      if (!course.isActive || course.status === "archived") return Response.json({ ok: false, error: { message: "Restore the course before scheduling another offering." } }, { status: 409 });
      const [created] = await tx.insert(courseOfferings).values({ ...parsed.data, venue: parsed.data.venue || null, joiningInstructions: parsed.data.joiningInstructions || null, timeZone: "America/Jamaica" }).onConflictDoNothing({ target: courseOfferings.code }).returning();
      if (!created) return Response.json({ ok: false, error: { message: "This offering code is already in use. Refresh the offerings and choose a different code." } }, { status: 409 });
      await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.offering_created", entityType: "offering", entityId: created.id });
      return Response.json({ ok: true, data: created }, { status: 201, headers: { "Cache-Control": "no-store" } });
    });
    return result;
  } catch (error) { return adminErrorResponse(error); }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const { session } = await requireClientAdmin(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ ok: false, error: { message: "A same-origin request is required." } }, { status: 403 });
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ ok: false, error: { message: parsed.error.issues[0]?.message || "Invalid update." } }, { status: 422 });
    const database = getDb();
    if (parsed.data.action === "bulk_registration_status") {
      const results: unknown[] = [];
      const messages = new Set<string>();
      for (const id of [...new Set(parsed.data.ids)]) {
        const headers = new Headers(request.headers);
        headers.delete("content-length");
        headers.set("content-type", "application/json");
        const response: Response = await PATCH(new Request(request.url, { method: "PATCH", headers, body: JSON.stringify({ action: "registration_status", id, status: parsed.data.status, overrideCapacity: parsed.data.overrideCapacity }) }));
        const body = await response.json() as { data?: unknown; message?: string };
        if (!response.ok) return Response.json(body, { status: response.status });
        results.push(body.data);
        if (body.message) messages.add(body.message);
      }
      return Response.json({ ok: true, data: results, message: messages.size ? `Selected registrations processed. ${[...messages].join(" ")}` : "Selected registrations updated." });
    }
    if (parsed.data.action === "offering_update") {
      const input = parsed.data;
      if (input.endsAt <= input.startsAt || (input.capacityMode !== "unlimited" && input.capacity === null)) return Response.json({ ok: false, error: { message: input.endsAt <= input.startsAt ? "The end date must be after the start date." : "A capacity is required." } }, { status: 422 });
      const result = await database.transaction(async (tx) => {
        const locked = await lockCourseOffering(tx, input.id);
        if (!locked) return Response.json({ ok: false, error: { message: "Offering not found." } }, { status: 404 });
        const before = locked.offering;
        if (before.isCancelled) return Response.json({ ok: false, error: { message: "Cancelled offerings cannot be rescheduled." } }, { status: 409 });
        if (before.updatedAt.toISOString() !== input.updatedAt) return Response.json({ ok: false, error: { message: "This offering has changed. Refresh and reselect it before editing its schedule." } }, { status: 409 });
        const changes = { startsAt: input.startsAt, endsAt: input.endsAt, deliveryMode: input.deliveryMode, venue: input.venue || null, joiningInstructions: input.joiningInstructions || null, feeCents: input.feeCents, currency: input.currency, capacityMode: input.capacityMode, capacity: input.capacity, registrationOpensAt: input.registrationOpensAt, registrationClosesAt: input.registrationClosesAt, substitutionCutoffAt: input.substitutionCutoffAt, isPublished: input.isPublished };
        const changed = Object.entries(changes).some(([key, value]) => {
          const previous = before[key as keyof typeof changes];
          return value instanceof Date ? !(previous instanceof Date) || value.getTime() !== previous.getTime() : value !== previous;
        });
        if (!changed) return { updated: before, recipients: [] as { email: string }[], changed: false };
        const [updated] = await tx.update(courseOfferings).set({ ...changes, updatedAt: new Date(Math.max(Date.now(), before.updatedAt.getTime() + 1)) }).where(eq(courseOfferings.id, input.id)).returning();
        await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.offering_updated", entityType: "course_offering", entityId: input.id, metadata: { previousStartsAt: before.startsAt.toISOString(), startsAt: updated.startsAt.toISOString() } });
        const recipients = await tx.select({ email: courseRegistrations.applicantEmail }).from(courseRegistrations).where(eq(courseRegistrations.offeringId, input.id));
        return { updated, recipients, changed: true };
      });
      if (result instanceof Response) return result;
      let failed = 0;
      const emails = [...new Set(result.recipients.map((row) => row.email))];
      for (const email of emails) {
        const delivery = await sendCourseMail({ to: email, subject: "CH Elevate course schedule updated", text: `The schedule or delivery details for your course have changed. The course now begins ${result.updated.startsAt.toLocaleString("en-JM", { timeZone: result.updated.timeZone })}. Sign in to your portal for the latest venue or joining instructions.` }).catch(() => ({ delivered: false }));
        if (!delivery.delivered) failed++;
      }
      const message = failed ? "Offering schedule saved, but one or more notification emails were not delivered. Contact the applicants separately; do not repeat the schedule update." : !result.changed ? "Offering schedule is unchanged. No notification emails were sent." : emails.length ? "Offering schedule saved and notification emails sent." : "Offering schedule saved. There are no registered applicants to notify.";
      return Response.json({ ok: true, data: result.updated, message, notifications: { attempted: emails.length, failed } }, { headers: { "Cache-Control": "no-store" } });
    }
    if (parsed.data.action === "offering_cancel") {
      const offeringId = parsed.data.id;
      const [cancelled] = await database.transaction(async (tx) => {
        if (!await lockCourseOffering(tx, offeringId)) return [];
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
      const input = parsed.data;
      const result = await database.transaction(async (tx) => {
        const [existing] = await tx.select().from(courseRegistrations).where(eq(courseRegistrations.id, input.id)).for("update");
        if (!existing) return Response.json({ ok: false, error: { message: "Registration not found." } }, { status: 404 });
        if (!canTransitionPayment(existing.paymentStatus, input.paymentStatus)) return Response.json({ ok: false, error: { message: `Payment cannot move directly from ${existing.paymentStatus.replaceAll("_", " ")} to ${input.paymentStatus.replaceAll("_", " ")}.` } }, { status: 409 });
        const reference = input.paymentReference || null;
        if (existing.paymentStatus === input.paymentStatus && existing.paymentReference === reference) return { updated: existing, notify: false };
        const [updated] = await tx.update(courseRegistrations).set({ paymentStatus: input.paymentStatus, paymentReference: reference, updatedAt: new Date() }).where(eq(courseRegistrations.id, input.id)).returning();
        await tx.insert(coursePaymentRecords).values({ registrationId: updated.id, status: input.paymentStatus, amountCents: updated.amountDueCents, reference, recordedByAuthUserId: session.user.id });
        await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.payment_updated", entityType: "course_registration", entityId: input.id, metadata: { previousStatus: existing.paymentStatus, status: input.paymentStatus } });
        return { updated, notify: existing.paymentStatus !== input.paymentStatus };
      });
      if (result instanceof Response) return result;
      const delivery = result.notify ? await sendCourseMail({ to: result.updated.applicantEmail, subject: "CH Elevate payment status updated", text: `Your course registration payment status is now: ${input.paymentStatus.replaceAll("_", " ")}.` }).catch(() => ({ delivered: false })) : null;
      return Response.json({ ok: true, data: result.updated, ...(delivery && !delivery.delivered ? { message: "Payment status saved, but the notification email was not delivered. Contact the applicant separately; do not repeat the payment update." } : {}) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (parsed.data.action === "attendance") {
      if (parsed.data.complete && !canMarkCompleted(parsed.data.attendance)) return Response.json({ ok: false, error: { message: "Only attended participants can be marked complete." } }, { status: 422 });
      const input = parsed.data;
      return await database.transaction(async (tx) => {
        const identities = await tx.select({ offeringId: courseOfferings.id, courseId: courseOfferings.courseId }).from(registrationParticipants).innerJoin(courseOfferings, eq(courseOfferings.id, registrationParticipants.offeringId)).where(inArray(registrationParticipants.id, input.participantIds)).orderBy(asc(courseOfferings.courseId), asc(courseOfferings.id));
        for (const offeringId of new Set(identities.map((row) => row.offeringId))) {
          const locked = await lockCourseOffering(tx, offeringId);
          if (!locked || (input.complete && locked.offering.isCancelled)) return Response.json({ ok: false, error: { message: "Cancelled or missing offerings cannot receive completions." } }, { status: 409 });
        }
        const members = await tx.select({ status: registrationParticipants.status, registrationId: registrationParticipants.registrationId }).from(registrationParticipants).where(inArray(registrationParticipants.id, input.participantIds)).for("update");
        if (members.length !== new Set(input.participantIds).size) return Response.json({ ok: false, error: { message: "One or more participants were not found." } }, { status: 404 });
        if (input.complete && members.some((member) => !["approved", "completed"].includes(member.status))) return Response.json({ ok: false, error: { message: "Only approved participants can be marked complete. Approve their registration first." } }, { status: 409 });
        const now = new Date();
        await tx.update(registrationParticipants).set({ attendance: input.attendance, completedAt: input.complete ? sql`coalesce(${registrationParticipants.completedAt}, ${now.toISOString()}::timestamptz)` : null, status: input.complete ? "completed" : sql`case when ${registrationParticipants.status} = 'completed' then 'approved'::registration_status else ${registrationParticipants.status} end`, updatedAt: now }).where(inArray(registrationParticipants.id, input.participantIds));
        if (!input.complete) {
          await tx.update(courseRegistrations).set({ status: "approved", updatedAt: now }).where(and(inArray(courseRegistrations.id, members.map((member) => member.registrationId)), eq(courseRegistrations.status, "completed")));
          const revoked = await tx.update(courseCertificates).set({ revokedAt: now }).where(and(inArray(courseCertificates.participantId, input.participantIds), isNull(courseCertificates.revokedAt))).returning({ id: courseCertificates.id });
          for (const certificate of revoked) await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.certificate_revoked", entityType: "course_certificate", entityId: certificate.id, metadata: { reason: "completion_corrected" } });
        }
        await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.attendance_updated", entityType: "registration_participant", metadata: { ids: input.participantIds, attendance: input.attendance, complete: input.complete } });
        return Response.json({ ok: true });
      });
    }
    if (parsed.data.action === "certificate") {
      const participantId = parsed.data.participantId;
      const result = await database.transaction(async (tx) => {
        const [identity] = await tx.select({ offeringId: registrationParticipants.offeringId }).from(registrationParticipants).where(eq(registrationParticipants.id, participantId));
        if (!identity) return null;
        const locked = await lockCourseOffering(tx, identity.offeringId);
        if (!locked || locked.offering.isCancelled) return null;
        const [participant] = await tx.select().from(registrationParticipants).where(eq(registrationParticipants.id, participantId)).for("update");
        if (!participant || participant.status !== "completed" || !isCertificateEligible(participant.attendance, participant.completedAt)) return null;
        const [existing] = await tx.select().from(courseCertificates).where(eq(courseCertificates.participantId, participantId));
        if (existing && !existing.revokedAt && existing.completedAt.getTime() === participant.completedAt!.getTime() && existing.participantName === participant.name && existing.courseTitle === locked.course.title) return { certificate: existing, email: participant.email, alreadyIssued: true };
        const snapshot = { participantName: participant.name, courseTitle: locked.course.title, completedAt: participant.completedAt!, issuedAt: new Date(), revokedAt: null };
        const [certificate] = await tx.insert(courseCertificates).values({ participantId, certificateNumber: `CHE-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`, ...snapshot }).onConflictDoUpdate({ target: courseCertificates.participantId, set: snapshot }).returning();
        await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.certificate_issued", entityType: "course_certificate", entityId: certificate.id, metadata: { reissued: Boolean(existing) } });
        return { certificate, email: participant.email, alreadyIssued: false };
      });
      if (!result) return Response.json({ ok: false, error: { message: "Only completed attendees on an uncancelled offering can receive a certificate." } }, { status: 409 });
      if (!result.alreadyIssued) await sendCourseMail({ to: result.email, subject: "Your CH Elevate certificate is ready", text: `Your certificate for ${result.certificate.courseTitle} is now available in your client portal.` });
      return Response.json({ ok: true, data: result.certificate, message: result.alreadyIssued ? "This certificate is already issued." : "Certificate issued." });
    }
    if (parsed.data.action === "archive_material") {
      if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ ok: false, error: { message: "A same-origin request is required." } }, { status: 403 });
      const input = parsed.data;
      return await database.transaction(async (tx) => {
        const [before] = await tx.select().from(courseMaterials).where(eq(courseMaterials.id, input.id));
        if (!before) return Response.json({ ok: false, error: { message: "Material not found." } }, { status: 404 });
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${JSON.stringify([before.courseId, before.offeringId || "", before.recipientProfileId || "", before.title])}))`);
        if (!input.archived) {
          const [active] = await tx.select({ id: courseMaterials.id }).from(courseMaterials).where(and(before.courseId ? eq(courseMaterials.courseId, before.courseId) : isNull(courseMaterials.courseId), before.offeringId ? eq(courseMaterials.offeringId, before.offeringId) : isNull(courseMaterials.offeringId), before.recipientProfileId ? eq(courseMaterials.recipientProfileId, before.recipientProfileId) : isNull(courseMaterials.recipientProfileId), eq(courseMaterials.title, before.title), eq(courseMaterials.isArchived, false), ne(courseMaterials.id, before.id))).limit(1);
          if (active) return Response.json({ ok: false, error: { message: "Another version is active. Archive it before restoring this version." } }, { status: 409 });
        }
        const [material] = await tx.update(courseMaterials).set({ isArchived: input.archived }).where(eq(courseMaterials.id, input.id)).returning({ id: courseMaterials.id, isArchived: courseMaterials.isArchived });
        await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.material_archived", entityType: "course_material", entityId: input.id, metadata: { archived: input.archived } });
        return Response.json({ ok: true, data: material });
      });
    }
    if (parsed.data.action === "course_active") {
      return Response.json({ ok: false, error: { message: "Use Edit course in the catalogue to change its publication status." } }, { status: 409 });
    }
    if (parsed.data.action === "offering_published") {
      const input = parsed.data;
      return await database.transaction(async (tx) => {
        const locked = await lockCourseOffering(tx, input.id);
        if (!locked) return Response.json({ ok: false, error: { message: "Offering not found." } }, { status: 404 });
        const before = locked.offering;
        if (before.isCancelled && input.published) return Response.json({ ok: false, error: { message: "Cancelled offerings cannot be published." } }, { status: 409 });
        if (before.isPublished === input.published) return Response.json({ ok: true, data: before });
        const [offering] = await tx.update(courseOfferings).set({ isPublished: input.published, updatedAt: new Date(Math.max(Date.now(), before.updatedAt.getTime() + 1)) }).where(eq(courseOfferings.id, input.id)).returning();
        await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.offering_published_updated", entityType: "course_offering", entityId: input.id, metadata: { published: input.published } });
        return Response.json({ ok: true, data: offering }, { headers: { "Cache-Control": "no-store" } });
      });
    }

    if (parsed.data.action !== "registration_status") {
      return Response.json({ ok: false, error: { message: "Unsupported course update." } }, { status: 422 });
    }
    const statusUpdate = parsed.data;

    const result = await database.transaction(async (tx) => {
      const [identity] = await tx.select({ offeringId: courseRegistrations.offeringId }).from(courseRegistrations).where(eq(courseRegistrations.id, statusUpdate.id));
      if (!identity) return { error: "Registration not found.", code: 404 };
      const locked = await lockCourseOffering(tx, identity.offeringId);
      if (!locked) return { error: "Offering not found.", code: 404 };
      const { course, offering } = locked;
      const [registration] = await tx.select().from(courseRegistrations).where(eq(courseRegistrations.id, statusUpdate.id)).for("update");
      if (!registration) return { error: "Registration not found.", code: 404 };
      if (offering.isCancelled && ["approved", "completed"].includes(statusUpdate.status)) return { error: "Cancelled offerings cannot receive approvals or completions.", code: 409 };
      const members = await tx.select().from(registrationParticipants).where(eq(registrationParticipants.registrationId, registration.id)).for("update");
      const incremental = registration.status === "approved" && statusUpdate.status === "approved";
      const participantReview = Boolean(statusUpdate.participantId) || incremental;
      const targets = statusUpdate.participantId ? members.filter((member) => member.id === statusUpdate.participantId) : incremental ? members.filter((member) => ["pending_review", "waitlisted"].includes(member.status)) : members;
      if (statusUpdate.participantId && !targets.length) return { error: "Participant not found in this registration.", code: 404 };
      if ((incremental && !targets.length) || (participantReview && statusUpdate.status === "approved" && targets.every((member) => ["approved", "completed"].includes(member.status)))) return { updated: registration, invitations: [], finalStatus: "approved" as const, participantReview: false };
      if (!targets.length) return { error: "A registration must contain participants before review.", code: 409 };
      const targetIds = targets.map((member) => member.id);
      const retained = members.filter((member) => !targetIds.includes(member.id));
      const retainedSeats = retained.filter((member) => ["approved", "completed"].includes(member.status)).length;
      if (statusUpdate.status === "completed") {
        if (targets.some((member) => !["approved", "completed"].includes(member.status) || member.attendance !== "attended")) return { error: "Approve the selected participants and record attended before completing them.", code: 409 };
      }
      let finalStatus: RegistrationStatus = statusUpdate.status;
      let capacityReason: string | null = null;
      if (statusUpdate.status === "approved") {
        const [seatCount] = await tx.select({ value: count() }).from(registrationParticipants).where(and(eq(registrationParticipants.offeringId, registration.offeringId), ne(registrationParticipants.registrationId, registration.id), inArray(registrationParticipants.status, ["approved", "completed"])));
        const requestCount = { value: targets.length };
        if (!requestCount.value) return { error: "A registration must contain participants before approval.", code: 409 };
        const [firstWaitlisted] = registration.status === "waitlisted" && !statusUpdate.overrideCapacity
          ? await tx.select({ id: courseRegistrations.id }).from(courseRegistrations).where(and(eq(courseRegistrations.offeringId, registration.offeringId), eq(courseRegistrations.status, "waitlisted"))).orderBy(asc(courseRegistrations.createdAt), asc(courseRegistrations.id)).limit(1)
          : [];
        finalStatus = firstWaitlisted && firstWaitlisted.id !== registration.id
          ? "waitlisted"
          : decideApprovalStatus({ capacityMode: offering.capacityMode, capacity: offering.capacity, approvedSeats: seatCount.value + retainedSeats, requestedSeats: requestCount.value, override: statusUpdate.overrideCapacity });
        const enrolled = await courseEnrolmentCount(tx, course.id, registration.id) + retainedSeats;
        if (course.enrollmentLimit !== null && enrolled + requestCount.value > course.enrollmentLimit) {
          finalStatus = "waitlisted";
          capacityReason = `Course-wide enrolment limit reached (${enrolled}/${course.enrollmentLimit}); this application needs ${requestCount.value} places. Increase the course limit or release places before approving.`;
        } else if (finalStatus === "waitlisted") capacityReason = "Offering capacity or waitlist order prevents approval. The application remains waitlisted.";
      }
      // Validate every existing account before changing any status or linking a group.
      const approvedAccounts = new Map<string, string>();
      if (finalStatus === "approved") {
        const emails = [...new Set([...targets.map((member) => member.emailNormalized), ...(registration.organisationId && registration.status !== "approved" ? [registration.applicantEmail.toLowerCase()] : [])])];
        const accounts = await tx.select({ id: user.id, email: user.email, emailVerified: user.emailVerified }).from(user).where(inArray(user.email, emails)).for("share");
        const accountProfiles = accounts.length ? await tx.select().from(profiles).where(inArray(profiles.authUserId, accounts.map((account) => account.id))).for("share") : [];
        for (const account of accounts) {
          const accountProfile = accountProfiles.find((candidate) => candidate.authUserId === account.id);
          if (!accountProfile?.active || accountProfile.role !== "customer") return { error: "A participant or coordinator email belongs to an account that is not an active student. Resolve that account before approving this registration.", code: 409 };
          // An email typed during signup is not ownership proof. Unverified accounts use the invitation flow.
          if (account.emailVerified) approvedAccounts.set(account.email, accountProfile.id);
        }
      }
      const now = new Date();
      const statuses = [...retained.map((member) => member.status), ...targets.map(() => finalStatus)];
      const groupStatus: RegistrationStatus = !participantReview ? finalStatus : statuses.every((status) => status === "completed") ? "completed" : statuses.some((status) => ["approved", "completed"].includes(status)) ? "approved" : statuses.every((status) => status === "cancelled") ? "cancelled" : statuses.every((status) => status === "rejected") ? "rejected" : statuses.every((status) => status === "waitlisted") ? "waitlisted" : "pending_review";
      const [updated] = await tx.update(courseRegistrations).set({ status: groupStatus, approvedAt: groupStatus === "approved" ? registration.approvedAt ?? now : registration.approvedAt, updatedAt: now }).where(eq(courseRegistrations.id, registration.id)).returning();
      const participants = await tx.update(registrationParticipants).set({ status: finalStatus, completedAt: finalStatus === "completed" ? sql`coalesce(${registrationParticipants.completedAt}, ${now.toISOString()}::timestamptz)` : null, updatedAt: now }).where(inArray(registrationParticipants.id, targetIds)).returning();
      if (finalStatus !== "completed" && participants.length) {
        const revoked = await tx.update(courseCertificates).set({ revokedAt: now }).where(and(inArray(courseCertificates.participantId, participants.map((participant) => participant.id)), isNull(courseCertificates.revokedAt))).returning({ id: courseCertificates.id });
        for (const certificate of revoked) await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.certificate_revoked", entityType: "course_certificate", entityId: certificate.id, metadata: { reason: "registration_status_changed" } });
      }
      const invitations: { email: string; token: string | null; name: string }[] = [];
      // A new decision supersedes outstanding links; completed registrations retain valid access.
      if (finalStatus !== "completed") await tx.update(accountInvitations).set({ revokedAt: now }).where(and(eq(accountInvitations.registrationId, registration.id), participantReview ? inArray(accountInvitations.participantId, targetIds) : undefined, isNull(accountInvitations.acceptedAt), isNull(accountInvitations.revokedAt)));
      if (finalStatus === "approved") {
        for (const participant of participants) {
          const profileId = approvedAccounts.get(participant.emailNormalized);
          if (profileId) {
            await tx.update(registrationParticipants).set({ profileId, updatedAt: now }).where(eq(registrationParticipants.id, participant.id));
            if (registration.organisationId) {
              const role = participant.emailNormalized === registration.applicantEmail.toLowerCase() ? "coordinator" : "participant";
              const membership = tx.insert(organisationMemberships).values({ organisationId: registration.organisationId, profileId, role });
              if (role === "coordinator") await membership.onConflictDoUpdate({ target: [organisationMemberships.organisationId, organisationMemberships.profileId], set: { role } });
              else await membership.onConflictDoNothing();
            }
            invitations.push({ email: participant.email, token: null, name: participant.name });
            continue;
          }
          await tx.update(registrationParticipants).set({ profileId: null, updatedAt: now }).where(eq(registrationParticipants.id, participant.id));
          const token = randomBytes(32).toString("base64url");
          await tx.insert(accountInvitations).values({ registrationId: registration.id, participantId: participant.id, email: participant.email, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7 * 86400000), organisationRole: registration.organisationId && participant.emailNormalized === registration.applicantEmail.toLowerCase() ? "coordinator" : registration.organisationId ? "participant" : null });
          invitations.push({ email: participant.email, token, name: participant.name });
        }
        if (registration.organisationId && registration.status !== "approved" && !participants.some((participant) => participant.emailNormalized === registration.applicantEmail.toLowerCase())) {
          const coordinatorProfileId = approvedAccounts.get(registration.applicantEmail.toLowerCase());
          if (coordinatorProfileId) {
            await tx.insert(organisationMemberships).values({ organisationId: registration.organisationId, profileId: coordinatorProfileId, role: "coordinator" }).onConflictDoUpdate({ target: [organisationMemberships.organisationId, organisationMemberships.profileId], set: { role: "coordinator" } });
            invitations.push({ email: registration.applicantEmail, token: null, name: registration.applicantName });
          } else {
            const token = randomBytes(32).toString("base64url");
            await tx.insert(accountInvitations).values({ registrationId: registration.id, email: registration.applicantEmail, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 7 * 86400000), organisationRole: "coordinator" });
            invitations.push({ email: registration.applicantEmail, token, name: registration.applicantName });
          }
        }
      }
      await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.registration_status_updated", entityType: "course_registration", entityId: registration.id, metadata: { requested: statusUpdate.status, applied: finalStatus, participantIds: targetIds, override: statusUpdate.overrideCapacity, capacityReason } });
      return { updated, invitations, finalStatus, capacityReason, participantReview };
    });
    if ("error" in result) return Response.json({ ok: false, error: { message: result.error } }, { status: result.code });
    const baseUrl = process.env.COURSE_PORTAL_URL || new URL(request.url).origin;
    const notifications = { attempted: 0, failed: 0 };
    // Decisions have committed. A mail failure must not imply the decision failed.
    async function notify(input: Parameters<typeof sendCourseMail>[0]) {
      notifications.attempted++;
      const delivery = await sendCourseMail(input).catch(() => ({ delivered: false }));
      if (!delivery.delivered) notifications.failed++;
    }
    for (const invitation of result.invitations) await notify({ to: invitation.email, subject: "Your CH Elevate course registration is approved", text: invitation.token ? `Hello ${invitation.name},\n\nYour registration is approved. Activate your portal account within 7 days:\n${baseUrl}/portal/activate?token=${encodeURIComponent(invitation.token)}\n\nCH Elevate` : `Hello ${invitation.name},\n\nYour registration is approved and has been linked to your existing account. Sign in here:\n${baseUrl}/portal/login\n\nCH Elevate` });
    if (result.finalStatus !== "approved") await notify({ to: result.updated.applicantEmail, subject: `CH Elevate registration ${result.finalStatus.replaceAll("_", " ")}`, text: result.participantReview ? `The reviewed participants are now: ${result.finalStatus.replaceAll("_", " ")}. Other participants retain their current status. Sign in to your portal for details.` : `Your course registration status is now: ${result.finalStatus.replaceAll("_", " ")}.` });
    const deliveryWarning = notifications.failed
      ? `Registration decision saved, but ${notifications.failed} of ${notifications.attempted} notification emails were not delivered. Contact the affected students or coordinator separately. Do not repeat the approval or status change to retry email delivery.`
      : undefined;
    return Response.json({ ok: true, data: result.updated, notifications, message: [result.capacityReason, result.participantReview ? "Selected participants reviewed. Other participants are unchanged." : undefined, deliveryWarning].filter(Boolean).join(" ") || undefined }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
