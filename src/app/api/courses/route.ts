import { and, asc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { auditLogs, courseOfferings, courseRegistrations, courses, organisations, profiles, registrationParticipants, user } from "@/db/schema";
import { courseApplicationSchema } from "@/lib/courses";
import { sendCourseMail } from "@/server/course-mail";
import { sendPrimaryInboxMail } from "@/server/site-mail";
import { getDb } from "@/server/db";

export async function GET() {
  if (!process.env.DATABASE_URL) return Response.json({ ok: true, data: [] });
  try {
    const now = new Date();
    const rows = await getDb()
    .select({
      id: courseOfferings.id, courseId: courses.id, slug: courses.slug, title: courses.title,
      summary: courses.summary, description: courses.description, code: courseOfferings.code,
      startsAt: courseOfferings.startsAt, endsAt: courseOfferings.endsAt, timeZone: courseOfferings.timeZone,
      deliveryMode: courseOfferings.deliveryMode, venue: courseOfferings.venue, feeCents: courseOfferings.feeCents,
      currency: courseOfferings.currency, capacityMode: courseOfferings.capacityMode, capacity: courseOfferings.capacity,
      registrationClosesAt: courseOfferings.registrationClosesAt,
      approvedSeats: sql<number>`count(${registrationParticipants.id}) filter (where ${registrationParticipants.status} in ('approved','completed'))::int`,
    })
    .from(courseOfferings)
    .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
    .leftJoin(registrationParticipants, eq(registrationParticipants.offeringId, courseOfferings.id))
    .where(and(eq(courses.isActive, true), eq(courseOfferings.isPublished, true), eq(courseOfferings.isCancelled, false), gt(courseOfferings.startsAt, now), or(isNull(courseOfferings.registrationOpensAt), lt(courseOfferings.registrationOpensAt, now))))
    .groupBy(courseOfferings.id, courses.id)
    .orderBy(asc(courseOfferings.startsAt));
    return Response.json({ ok: true, data: rows });
  } catch {
    return Response.json({ ok: false, error: "Course registration is temporarily unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!process.env.DATABASE_URL) return Response.json({ ok: false, error: "Registration storage is not configured." }, { status: 503 });
  try {
    const parsed = courseApplicationSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ ok: false, error: "Please review the registration details.", issues: parsed.error.issues }, { status: 422 });
  const database = getDb();
  const result = await database.transaction(async (tx) => {
    const [offering] = await tx.select().from(courseOfferings).where(eq(courseOfferings.id, parsed.data.offeringId)).limit(1);
    const now = new Date();
    if (!offering?.isPublished || offering.isCancelled || offering.startsAt <= now || (offering.registrationOpensAt && offering.registrationOpensAt > now) || (offering.registrationClosesAt && offering.registrationClosesAt < now)) return { error: "Registration is not open for this course." as const };
    const normalizedEmails = [...new Set(parsed.data.participants.map((participant) => participant.email))];
    if (normalizedEmails.length !== parsed.data.participants.length) return { error: "Each participant must use a unique email address." as const };
    const duplicates = await tx.select({ email: registrationParticipants.email }).from(registrationParticipants).where(and(eq(registrationParticipants.offeringId, offering.id), inArray(registrationParticipants.emailNormalized, normalizedEmails)));
    if (duplicates.length) return { error: `${duplicates[0].email} is already registered for this offering.` as const };
    const existingProfiles = await tx
      .select({ email: user.email, profileId: profiles.id })
      .from(user)
      .innerJoin(profiles, eq(profiles.authUserId, user.id))
      .where(and(inArray(user.email, normalizedEmails), eq(profiles.role, "customer")));
    const profileByEmail = new Map(existingProfiles.map((row) => [row.email.toLowerCase(), row.profileId]));
    let organisationId: string | null = null;
    if (parsed.data.organisationName) {
      const [organisation] = await tx.insert(organisations).values({ name: parsed.data.organisationName, billingEmail: parsed.data.applicantEmail, phone: parsed.data.applicantPhone || null }).returning({ id: organisations.id });
      organisationId = organisation.id;
    }
    const [registration] = await tx.insert(courseRegistrations).values({
      offeringId: offering.id, organisationId, applicantName: parsed.data.applicantName,
      applicantEmail: parsed.data.applicantEmail, applicantPhone: parsed.data.applicantPhone || null,
      amountDueCents: offering.feeCents * parsed.data.participants.length,
    }).returning();
    const participants = await tx.insert(registrationParticipants).values(parsed.data.participants.map((participant) => ({
      registrationId: registration.id, offeringId: offering.id, name: participant.name,
      email: participant.email, emailNormalized: participant.email, phone: participant.phone || null,
      profileId: profileByEmail.get(participant.email) || null,
    }))).returning();
    await tx.insert(auditLogs).values({ action: "course.registration_submitted", entityType: "course_registration", entityId: registration.id, metadata: { seats: participants.length, organisation: Boolean(organisationId) } });
    return { registration, participants };
  });
  if ("error" in result) return Response.json({ ok: false, error: result.error }, { status: 409 });
  await Promise.all([
    sendCourseMail({ to: parsed.data.applicantEmail, subject: "CH Elevate course registration received", text: `Hello ${parsed.data.applicantName},\n\nWe received your registration for ${result.participants.length} participant${result.participants.length === 1 ? "" : "s"}. An administrator will review it and contact you by email.\n\nCH Elevate Consultancy Limited\ninfo@ch-elevateconsultancy.com` }),
    sendPrimaryInboxMail({
      replyTo: parsed.data.applicantEmail,
      subject: `New course registration from ${parsed.data.applicantName}`,
      text: [
        `Applicant: ${parsed.data.applicantName}`,
        `Email: ${parsed.data.applicantEmail}`,
        `Phone: ${parsed.data.applicantPhone || "Not provided"}`,
        `Organisation: ${parsed.data.organisationName || "Individual registration"}`,
        `Participants: ${result.participants.length}`,
        "",
        "Review this registration in Course administration.",
      ].join("\n"),
    }),
  ]);
    return Response.json({ ok: true, data: { id: result.registration.id, status: result.registration.status } }, { status: 201 });
  } catch {
    return Response.json({ ok: false, error: "Registration could not be stored. Please try again shortly." }, { status: 503 });
  }
}
