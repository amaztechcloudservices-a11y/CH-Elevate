import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { auditLogs, courseMaterials, courseOfferings, courses, profiles, registrationParticipants } from "@/db/schema";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { CourseFileError, discardPrivateUpload, savePrivateFile } from "@/server/course-storage";
import { readCourseUpload } from "@/server/course-upload";
import { getDb } from "@/server/db";

const optionalId = z.union([z.uuid(), z.literal("")]).optional().default("");
const metadataSchema = z.object({ title: z.string().trim().min(2).max(180), courseId: z.uuid(), offeringId: optionalId, recipientProfileId: optionalId, file: z.instanceof(File) }).strict();
const fail = (message: string, status: number) => Response.json({ ok: false, error: { message } }, { status });

export async function POST(request: Request) {
  let stored: Awaited<ReturnType<typeof savePrivateFile>> | undefined;
  try {
    const { session } = await requireClientAdmin(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) return fail("A same-origin request is required.", 403);
    const form = await readCourseUpload(request);
    const entries = [...form.entries()];
    if (new Set(entries.map(([key]) => key)).size !== entries.length) return fail("Duplicate upload fields are not allowed.", 422);
    const parsed = metadataSchema.safeParse(Object.fromEntries(entries));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Review the file and assignment.", 422);
    const input = parsed.data;
    // The stored file remains provisional until the transaction commits.
    const result = await getDb().transaction(async (tx) => {
      const [course] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, input.courseId)).for("share");
      if (!course) return fail("Course not found.", 404);
      if (input.offeringId) {
        const [offering] = await tx.select({ id: courseOfferings.id }).from(courseOfferings).where(and(eq(courseOfferings.id, input.offeringId), eq(courseOfferings.courseId, input.courseId))).for("share");
        if (!offering) return fail("The offering does not belong to the selected course.", 422);
      }
      if (input.recipientProfileId) {
        const [student] = await tx.select({ id: profiles.id }).from(profiles).where(and(eq(profiles.id, input.recipientProfileId), eq(profiles.role, "customer"), eq(profiles.active, true))).for("share");
        if (!student) return fail("Choose an active student account.", 422);
        const enrolments = await tx.select({ id: registrationParticipants.id }).from(registrationParticipants).innerJoin(courseOfferings, eq(courseOfferings.id, registrationParticipants.offeringId)).where(and(eq(registrationParticipants.profileId, student.id), eq(courseOfferings.courseId, course.id), input.offeringId ? eq(courseOfferings.id, input.offeringId) : undefined)).limit(1);
        if (!enrolments.length) return fail("The student must be registered for the selected course or offering.", 422);
      }
      const scope = and(eq(courseMaterials.courseId, input.courseId), input.offeringId ? eq(courseMaterials.offeringId, input.offeringId) : isNull(courseMaterials.offeringId), input.recipientProfileId ? eq(courseMaterials.recipientProfileId, input.recipientProfileId) : isNull(courseMaterials.recipientProfileId), eq(courseMaterials.title, input.title));
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${JSON.stringify([input.courseId, input.offeringId, input.recipientProfileId, input.title])}))`);
      const [previous] = await tx.select({ version: courseMaterials.version }).from(courseMaterials).where(scope).orderBy(desc(courseMaterials.version)).limit(1);
      stored = await savePrivateFile(input.file, "materials");
      const [material] = await tx.insert(courseMaterials).values({ ...stored, title: input.title, courseId: input.courseId, offeringId: input.offeringId || null, recipientProfileId: input.recipientProfileId || null, version: (previous?.version || 0) + 1 }).returning();
      await tx.update(courseMaterials).set({ isArchived: true }).where(and(scope, eq(courseMaterials.isArchived, false), ne(courseMaterials.id, material.id)));
      await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.material_uploaded", entityType: "course_material", entityId: material.id, metadata: { courseId: input.courseId, offeringId: input.offeringId || null, recipientProfileId: input.recipientProfileId || null, version: material.version } });
      return Response.json({ ok: true, data: { id: material.id, title: material.title, version: material.version } }, { status: 201, headers: { "Cache-Control": "no-store" } });
    });
    stored = undefined;
    return result;
  } catch (error) {
    if (stored) await discardPrivateUpload(stored.storageKey);
    if (error instanceof CourseFileError) return fail(error.message, 422);
    return adminErrorResponse(error);
  }
}
