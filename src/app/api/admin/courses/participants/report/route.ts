import { and, asc, eq, inArray } from "drizzle-orm";
import { auditLogs, courseOfferings, courseRegistrations, courses, organisations, registrationParticipants } from "@/db/schema";
import { participantReportSchema } from "@/lib/course-participant-report";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { createParticipantPdf, ParticipantReportError } from "@/server/course-participant-pdf";
import { getDb } from "@/server/db";

export const runtime = "nodejs";
const failure = (message: string, status: number) => Response.json({ ok: false, error: { message } }, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  try {
    const { session } = await requireClientAdmin(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) return failure("A same-origin request is required.", 403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return failure("Send a JSON participant selection.", 415);
    // Enforce the actual streamed length, not just a caller-supplied header.
    const reader = request.body?.getReader();
    if (!reader) return failure("Select participants before exporting.", 422);
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 50_000) { await reader.cancel(); return failure("The participant selection is too large.", 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let input: unknown;
    try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { return failure("Send a valid participant selection.", 422); }
    const parsed = participantReportSchema.safeParse(input);
    if (!parsed.success) return failure(parsed.error.issues[0]?.message || "Invalid participant selection.", 422);
    const { courseId, participantIds } = parsed.data;
    const database = getDb();
    // Names/contact details come exclusively from current saved records.
    const rows = await database.select({
      participantId: registrationParticipants.id, name: registrationParticipants.name, email: registrationParticipants.email,
      status: registrationParticipants.status, attendance: registrationParticipants.attendance,
      offeringCode: courseOfferings.code, startsAt: courseOfferings.startsAt, timeZone: courseOfferings.timeZone,
      organisationName: organisations.name, courseTitle: courses.title,
    }).from(registrationParticipants)
      .innerJoin(courseRegistrations, and(eq(courseRegistrations.id, registrationParticipants.registrationId), eq(courseRegistrations.offeringId, registrationParticipants.offeringId)))
      .innerJoin(courseOfferings, eq(courseOfferings.id, registrationParticipants.offeringId))
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .leftJoin(organisations, eq(organisations.id, courseRegistrations.organisationId))
      .where(and(eq(courses.id, courseId), inArray(registrationParticipants.id, participantIds)))
      .orderBy(asc(registrationParticipants.name), asc(registrationParticipants.id));
    if (rows.length !== participantIds.length) return failure("One or more selected participants no longer belong to this course. Refresh the list and select again.", 409);
    const generatedAt = new Date();
    const bytes = await createParticipantPdf(rows[0].courseTitle, rows, generatedAt);
    await database.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.participant_report_exported", entityType: "course", entityId: courseId, metadata: { participantCount: rows.length } });
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "application/pdf", "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="course-participants-${generatedAt.toISOString().slice(0, 10)}.pdf"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof ParticipantReportError) return failure(error.message, 422);
    const response = adminErrorResponse(error); response.headers.set("Cache-Control", "private, no-store"); return response;
  }
}
