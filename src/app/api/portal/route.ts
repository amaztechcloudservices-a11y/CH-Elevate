import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { auditLogs, courseCertificates, courseInvoices, courseMaterials, courseOfferings, courseRegistrations, courses, organisationMemberships, organisations, profiles, registrationParticipants, studentPosts } from "@/db/schema";
import { isCurrentCourseCertificate, isSubstitutionOpen } from "@/lib/courses";
import { isValidProfileTimeZone } from "@/lib/student-profile";
import { portalErrorResponse, requirePortalProfile } from "@/server/portal-auth";
import { getDb } from "@/server/db";
import { addParticipantSchema, replaceParticipantSchema, changeCoordinatorParticipant, CoordinatorChangeError } from "@/server/course-coordinator";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel_request"), participantId: z.uuid() }),
  addParticipantSchema,
  replaceParticipantSchema,
  z.object({ action: z.literal("update_profile"), displayName: z.string().trim().min(2).max(120), phone: z.string().trim().max(40).optional().default(""), jobTitle: z.string().trim().max(120).optional().default(""), country: z.string().trim().max(100).optional().default(""), timeZone: z.string().trim().min(3).max(100).default("America/Jamaica") }),
]);

export async function GET(request: Request) {
  try {
    const { session, profile } = await requirePortalProfile(request);
    const database = getDb();
    const memberships = await database.select({ organisationId: organisationMemberships.organisationId, role: organisationMemberships.role, organisationName: organisations.name }).from(organisationMemberships).innerJoin(organisations, eq(organisations.id, organisationMemberships.organisationId)).where(eq(organisationMemberships.profileId, profile.id));
    const profileOnly = new URL(request.url).searchParams.get("scope") === "profile";
    const coordinatedOrganisationIds = (profileOnly ? [] : memberships)
      .filter((row) => row.role === "coordinator")
      .map((row) => row.organisationId);
    const participantRows = await database.select({ participant: registrationParticipants, registration: courseRegistrations, offering: courseOfferings, course: courses, organisationName: organisations.name }).from(registrationParticipants).innerJoin(courseRegistrations, eq(courseRegistrations.id, registrationParticipants.registrationId)).innerJoin(courseOfferings, eq(courseOfferings.id, registrationParticipants.offeringId)).innerJoin(courses, eq(courses.id, courseOfferings.courseId)).leftJoin(organisations, eq(organisations.id, courseRegistrations.organisationId)).where(coordinatedOrganisationIds.length ? or(eq(registrationParticipants.profileId, profile.id), inArray(courseRegistrations.organisationId, coordinatedOrganisationIds)) : eq(registrationParticipants.profileId, profile.id)).orderBy(asc(courseOfferings.startsAt));
    const accessible = participantRows.filter((row) => ["approved", "completed"].includes(row.participant.status));
    const courseIds = [...new Set(accessible.map((row) => row.course.id))];
    const offeringIds = [...new Set(accessible.map((row) => row.offering.id))];
    // Payment documents may be needed before approval; download authorization uses the same registration ownership.
    const registrationIds = [...new Set(participantRows.map((row) => row.registration.id))];
    const ownParticipantIds = participantRows.filter((row) => row.participant.profileId === profile.id).map((row) => row.participant.id);
    const [materials, invoices, certificates, posts] = await Promise.all([
      courseIds.length ? database.select().from(courseMaterials).where(and(
        eq(courseMaterials.isArchived, false),
        or(isNull(courseMaterials.recipientProfileId), eq(courseMaterials.recipientProfileId, profile.id)),
        or(
          and(inArray(courseMaterials.courseId, courseIds), isNull(courseMaterials.offeringId)),
          offeringIds.length ? inArray(courseMaterials.offeringId, offeringIds) : undefined,
        ),
      )) : [],
      registrationIds.length ? database.select().from(courseInvoices).where(inArray(courseInvoices.registrationId, registrationIds)) : [],
      ownParticipantIds.length ? database.select().from(courseCertificates).where(and(inArray(courseCertificates.participantId, ownParticipantIds), isNull(courseCertificates.revokedAt))) : [],
      database.select({ id: studentPosts.id, title: studentPosts.title, body: studentPosts.body, createdAt: studentPosts.createdAt, updatedAt: studentPosts.updatedAt }).from(studentPosts).where(and(eq(studentPosts.profileId, profile.id), eq(studentPosts.isPublished, true))).orderBy(desc(studentPosts.createdAt), desc(studentPosts.id)),
    ]);
    // Explicit public projections keep internal notes, storage paths and applicant data off all portal responses.
    const registrations = participantRows.map(({ participant, registration, offering, course, organisationName }) => ({
      participant: { id: participant.id, profileId: participant.profileId, name: participant.name, email: participant.email, status: participant.status, attendance: participant.attendance, cancellationRequestedAt: participant.cancellationRequestedAt, completedAt: participant.completedAt, updatedAt: participant.updatedAt },
      isOwn: participant.profileId === profile.id,
      registration: { id: registration.id, organisationId: registration.organisationId, status: registration.status, paymentStatus: registration.paymentStatus, amountDueCents: registration.amountDueCents, changesOpen: Boolean(registration.organisationId && coordinatedOrganisationIds.includes(registration.organisationId) && !offering.isCancelled && ["pending_review", "approved", "waitlisted"].includes(registration.status) && offering.startsAt > new Date() && isSubstitutionOpen(offering.substitutionCutoffAt)) },
      offering: { id: offering.id, code: offering.code, startsAt: offering.startsAt, endsAt: offering.endsAt, timeZone: offering.timeZone, deliveryMode: offering.deliveryMode, venue: offering.venue, substitutionCutoffAt: offering.substitutionCutoffAt, currency: offering.currency, isCancelled: offering.isCancelled, joiningInstructions: ["approved", "completed"].includes(participant.status) ? offering.joiningInstructions : null },
      course: { id: course.id, title: course.title }, organisationName,
    }));
    return Response.json({ ok: true, data: {
      user: { name: profile.displayName, email: session.user.email, phone: profile.phone, jobTitle: profile.jobTitle, country: profile.country, timeZone: profile.timeZone }, memberships, registrations, posts,
      materials: materials.filter((material) => !material.recipientProfileId || accessible.some((row) => row.participant.profileId === profile.id && row.course.id === material.courseId && (!material.offeringId || row.offering.id === material.offeringId))).map(({ id, courseId, offeringId, title, originalFilename, mimeType, sizeBytes, version, createdAt }) => ({ id, courseId, offeringId, title, originalFilename, mimeType, sizeBytes, version, createdAt })),
      invoices: invoices.map(({ id, registrationId, documentType, reference, amountCents, dueAt, originalFilename }) => ({ id, registrationId, documentType, reference, amountCents, dueAt, originalFilename })),
      certificates: certificates.filter((certificate) => { const owner = participantRows.find((row) => row.participant.id === certificate.participantId); return owner && isCurrentCourseCertificate(certificate, owner.participant); }).map(({ id, certificateNumber, courseTitle, issuedAt, completedAt }) => ({ id, certificateNumber, courseTitle, issuedAt, completedAt })),
    } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return portalErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const { session, profile } = await requirePortalProfile(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ ok: false, error: { message: "A same-origin request is required." } }, { status: 403 });
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ ok: false, error: { message: parsed.error.issues[0]?.message || "Invalid request." } }, { status: 422 });
    if (parsed.data.action === "update_profile" && !isValidProfileTimeZone(parsed.data.timeZone)) return Response.json({ ok: false, error: { message: "Choose a valid timezone." } }, { status: 422 });
    const database = getDb();
    if (parsed.data.action === "update_profile") {
      const [updated] = await database.update(profiles).set({ displayName: parsed.data.displayName, phone: parsed.data.phone || null, jobTitle: parsed.data.jobTitle || null, country: parsed.data.country || null, timeZone: parsed.data.timeZone, updatedAt: new Date() }).where(eq(profiles.id, profile.id)).returning();
      await database.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.profile_updated", entityType: "profile", entityId: profile.id });
      return Response.json({ ok: true, data: updated });
    }
    if (parsed.data.action === "cancel_request") {
      const [row] = await database.update(registrationParticipants).set({ cancellationRequestedAt: new Date(), updatedAt: new Date() }).where(and(eq(registrationParticipants.id, parsed.data.participantId), eq(registrationParticipants.profileId, profile.id))).returning();
      if (!row) return Response.json({ ok: false, error: { message: "Registration not found." } }, { status: 404 });
      await database.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.cancellation_requested", entityType: "registration_participant", entityId: row.id });
      return Response.json({ ok: true, data: row });
    }
    const participant = await changeCoordinatorParticipant(parsed.data, { profileId: profile.id, authUserId: session.user.id });
    return Response.json({ ok: true, data: participant, message: "Participant submitted for administrator review." });
  } catch (error) {
    if (error instanceof CoordinatorChangeError) return Response.json({ ok: false, error: { message: error.message } }, { status: error.status });
    return portalErrorResponse(error);
  }
}
