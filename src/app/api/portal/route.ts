import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";

import { auditLogs, courseCertificates, courseInvoices, courseMaterials, courseOfferings, courseRegistrations, courses, organisationMemberships, organisations, profiles, registrationParticipants } from "@/db/schema";
import { isSubstitutionOpen } from "@/lib/courses";
import { portalErrorResponse, requirePortalProfile } from "@/server/portal-auth";
import { getDb } from "@/server/db";

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel_request"), participantId: z.uuid() }),
  z.object({ action: z.literal("add_participant"), registrationId: z.uuid(), name: z.string().trim().min(2).max(120), email: z.email().max(254).transform((value) => value.toLowerCase()), phone: z.string().trim().max(40).optional().default("") }),
  z.object({ action: z.literal("replace_participant"), participantId: z.uuid(), name: z.string().trim().min(2).max(120), email: z.email().max(254).transform((value) => value.toLowerCase()), phone: z.string().trim().max(40).optional().default("") }),
  z.object({ action: z.literal("update_profile"), displayName: z.string().trim().min(2).max(120), phone: z.string().trim().max(40).optional().default(""), jobTitle: z.string().trim().max(120).optional().default(""), country: z.string().trim().max(100).optional().default(""), timeZone: z.string().trim().min(3).max(100).default("America/Jamaica") }),
]);

export async function GET(request: Request) {
  try {
    const { session, profile } = await requirePortalProfile(request);
    const database = getDb();
    const memberships = await database.select({ organisationId: organisationMemberships.organisationId, role: organisationMemberships.role, organisationName: organisations.name }).from(organisationMemberships).innerJoin(organisations, eq(organisations.id, organisationMemberships.organisationId)).where(eq(organisationMemberships.profileId, profile.id));
    const coordinatedOrganisationIds = memberships
      .filter((row) => row.role === "coordinator")
      .map((row) => row.organisationId);
    const participantRows = await database.select({ participant: registrationParticipants, registration: courseRegistrations, offering: courseOfferings, course: courses, organisationName: organisations.name }).from(registrationParticipants).innerJoin(courseRegistrations, eq(courseRegistrations.id, registrationParticipants.registrationId)).innerJoin(courseOfferings, eq(courseOfferings.id, registrationParticipants.offeringId)).innerJoin(courses, eq(courses.id, courseOfferings.courseId)).leftJoin(organisations, eq(organisations.id, courseRegistrations.organisationId)).where(coordinatedOrganisationIds.length ? or(eq(registrationParticipants.profileId, profile.id), inArray(courseRegistrations.organisationId, coordinatedOrganisationIds)) : eq(registrationParticipants.profileId, profile.id)).orderBy(asc(courseOfferings.startsAt));
    const accessible = participantRows.filter((row) => ["approved", "completed"].includes(row.participant.status));
    const courseIds = [...new Set(accessible.map((row) => row.course.id))];
    const offeringIds = [...new Set(accessible.map((row) => row.offering.id))];
    const registrationIds = [...new Set(accessible.map((row) => row.registration.id))];
    const ownParticipantIds = participantRows.filter((row) => row.participant.profileId === profile.id).map((row) => row.participant.id);
    const [materials, invoices, certificates] = await Promise.all([
      courseIds.length ? database.select().from(courseMaterials).where(and(
        eq(courseMaterials.isArchived, false),
        or(
          and(inArray(courseMaterials.courseId, courseIds), isNull(courseMaterials.offeringId)),
          offeringIds.length ? inArray(courseMaterials.offeringId, offeringIds) : undefined,
        ),
      )) : [],
      registrationIds.length ? database.select().from(courseInvoices).where(inArray(courseInvoices.registrationId, registrationIds)) : [],
      ownParticipantIds.length ? database.select().from(courseCertificates).where(inArray(courseCertificates.participantId, ownParticipantIds)) : [],
    ]);
    return Response.json({ ok: true, data: { user: { name: profile.displayName, email: session.user.email, phone: profile.phone, jobTitle: profile.jobTitle, country: profile.country, timeZone: profile.timeZone }, memberships, registrations: participantRows, materials, invoices, certificates } });
  } catch (error) { return portalErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const { session, profile } = await requirePortalProfile(request);
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ ok: false, error: { message: parsed.error.issues[0]?.message || "Invalid request." } }, { status: 422 });
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
    const registrationId = parsed.data.action === "add_participant" ? parsed.data.registrationId : undefined;
    const [context] = parsed.data.action === "add_participant"
      ? await database.select({ registration: courseRegistrations, offering: courseOfferings }).from(courseRegistrations).innerJoin(courseOfferings, eq(courseOfferings.id, courseRegistrations.offeringId)).where(eq(courseRegistrations.id, registrationId!)).limit(1)
      : await database.select({ registration: courseRegistrations, offering: courseOfferings }).from(registrationParticipants).innerJoin(courseRegistrations, eq(courseRegistrations.id, registrationParticipants.registrationId)).innerJoin(courseOfferings, eq(courseOfferings.id, registrationParticipants.offeringId)).where(eq(registrationParticipants.id, parsed.data.participantId)).limit(1);
    if (!context?.registration.organisationId || !isSubstitutionOpen(context.offering.substitutionCutoffAt)) return Response.json({ ok: false, error: { message: "The participant change cutoff has passed." } }, { status: 409 });
    const [membership] = await database.select().from(organisationMemberships).where(and(eq(organisationMemberships.profileId, profile.id), eq(organisationMemberships.organisationId, context.registration.organisationId), eq(organisationMemberships.role, "coordinator"))).limit(1);
    if (!membership) return Response.json({ ok: false, error: { message: "Coordinator access is required." } }, { status: 403 });
    const values = { name: parsed.data.name, email: parsed.data.email, emailNormalized: parsed.data.email, phone: parsed.data.phone || null, status: "pending_review" as const, profileId: null, updatedAt: new Date() };
    const [participant] = parsed.data.action === "add_participant"
      ? await database.insert(registrationParticipants).values({ ...values, registrationId: context.registration.id, offeringId: context.registration.offeringId }).returning()
      : await database.update(registrationParticipants).set(values).where(eq(registrationParticipants.id, parsed.data.participantId)).returning();
    await database.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: `course.participant_${parsed.data.action === "add_participant" ? "added" : "replaced"}`, entityType: "registration_participant", entityId: participant.id });
    return Response.json({ ok: true, data: participant });
  } catch (error) { return portalErrorResponse(error); }
}
