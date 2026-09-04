import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { auditLogs, courseRegistrations, organisations, registrationParticipants } from "@/db/schema";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { lockCourseOffering } from "@/server/course-enrolment";
import { CourseRosterError, maxRosterBytes, parseCourseRoster } from "@/server/course-roster";
import { CourseFileError } from "@/server/course-storage";
import { readCourseUpload } from "@/server/course-upload";
import { getDb } from "@/server/db";

const metadataSchema = z.object({ offeringId: z.uuid(), organisationName: z.string().trim().min(2).max(180), applicantName: z.string().trim().min(2).max(120), applicantEmail: z.string().trim().pipe(z.email().max(254)).transform((value) => value.toLowerCase()), file: z.instanceof(File) }).strict();
const fail = (message: string, status: number) => Response.json({ ok: false, error: { message } }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  try {
    const { session } = await requireClientAdmin(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) return fail("A same-origin request is required.", 403);
    const entries = [...(await readCourseUpload(request, maxRosterBytes)).entries()];
    if (new Set(entries.map(([key]) => key)).size !== entries.length) return fail("Duplicate upload fields are not allowed.", 422);
    const parsed = metadataSchema.safeParse(Object.fromEntries(entries));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Review the roster details.", 422);
    const { file } = parsed.data;
    if (!/\.csv$/i.test(file.name) || !["text/csv", "application/vnd.ms-excel", "text/plain", ""].includes(file.type) || !file.size || file.size > maxRosterBytes) return fail("Choose a UTF-8 CSV file between 1 byte and 1 MB.", 422);
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
    catch { return fail("The roster must use UTF-8 encoding.", 422); }
    const participants = parseCourseRoster(text);
    const emails = participants.map((row) => row.email);
    const database = getDb();
    const result = await database.transaction(async (tx) => {
      const locked = await lockCourseOffering(tx, parsed.data.offeringId);
      if (!locked) throw new CourseRosterError("Offering not found.", 404);
      const { offering } = locked;
      if (offering.isCancelled) throw new CourseRosterError("Cancelled offerings cannot accept roster imports.", 409);
      const amountDueCents = offering.feeCents * participants.length;
      if (!Number.isSafeInteger(amountDueCents) || amountDueCents < 0 || amountDueCents > 2147483647) throw new CourseRosterError("The offering fee multiplied by the participant count exceeds the supported total.");
      const duplicates = await tx.select({ email: registrationParticipants.email }).from(registrationParticipants).where(and(eq(registrationParticipants.offeringId, offering.id), inArray(registrationParticipants.emailNormalized, emails)));
      if (duplicates.length) throw new CourseRosterError("One or more email addresses are already registered for this offering. No rows were imported.", 409);
      const [organisation] = await tx.insert(organisations).values({ name: parsed.data.organisationName, billingEmail: parsed.data.applicantEmail }).returning();
      const [registration] = await tx.insert(courseRegistrations).values({ offeringId: offering.id, organisationId: organisation.id, applicantName: parsed.data.applicantName, applicantEmail: parsed.data.applicantEmail, amountDueCents }).returning();
      await tx.insert(registrationParticipants).values(participants.map((row) => ({ registrationId: registration.id, offeringId: offering.id, name: row.name, email: row.email, emailNormalized: row.email, phone: row.phone || null })));
      await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.roster_imported", entityType: "course_registration", entityId: registration.id, metadata: { seats: participants.length } });
      return registration;
    });
    return Response.json({ ok: true, data: { id: result.id, offeringId: result.offeringId, organisationId: result.organisationId, status: result.status, amountDueCents: result.amountDueCents, participantCount: participants.length } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CourseRosterError) return fail(error.message, error.status);
    if (error instanceof CourseFileError) return fail(error.message, 422);
    const cause = error as { code?: string; cause?: { code?: string } };
    if ((cause?.code || cause?.cause?.code) === "23505") return fail("One or more email addresses are already registered for this offering. No rows were imported.", 409);
    return adminErrorResponse(error);
  }
}
