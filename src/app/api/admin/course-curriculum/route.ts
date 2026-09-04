import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { auditLogs, courseLessons, courseMaterials, courseModules, courses } from "@/db/schema";
import { curriculumSchema } from "@/lib/course-curriculum";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { readCourseCurriculum } from "@/server/course-curriculum";
import { getDb } from "@/server/db";

const fail = (message: string, status: number) => Response.json({ ok: false, error: { message } }, { status });
export async function GET(request: Request) {
  try {
    await requireClientAdmin(request);
    const parsed = z.uuid().safeParse(new URL(request.url).searchParams.get("courseId"));
    if (!parsed.success) return fail("Select a course.", 422);
    const data = await readCourseCurriculum(parsed.data);
    return data ? Response.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } }) : fail("Course not found.", 404);
  } catch (error) { return adminErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const { session } = await requireClientAdmin(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) return fail("A same-origin request is required.", 403);
    const body = await request.text();
    if (Buffer.byteLength(body) > 2_000_000) return fail("Curriculum content exceeds the 2 MB limit.", 413);
    let json; try { json = JSON.parse(body); } catch { return fail("Invalid curriculum data.", 422); }
    const parsed = curriculumSchema.safeParse(json);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Review the curriculum fields.", 422);
    const input = parsed.data;
    return await getDb().transaction(async (tx) => {
      const [course] = await tx.select().from(courses).where(eq(courses.id, input.courseId)).for("update");
      if (!course) return fail("Course not found.", 404);
      if (course.updatedAt.toISOString() !== input.updatedAt) return fail("This course changed in another window. Reload before saving.", 409);
      const materialIds = [...new Set(input.modules.flatMap((section) => section.lessons.filter((lesson) => lesson.contentType === "material" && lesson.materialId).map((lesson) => lesson.materialId!)))];
      if (materialIds.length) {
        const valid = await tx.select({ id: courseMaterials.id }).from(courseMaterials).where(and(inArray(courseMaterials.id, materialIds), eq(courseMaterials.courseId, course.id), isNull(courseMaterials.offeringId), isNull(courseMaterials.recipientProfileId), eq(courseMaterials.isArchived, false))).for("share");
        if (valid.length !== materialIds.length) return fail("Choose active, course-wide materials belonging to this course.", 422);
      }
      // Replace this course's ordered tree atomically. Files, enrolments and other courses are untouched.
      // Identifier collisions roll back the entire replacement, including its deletions.
      await tx.delete(courseModules).where(eq(courseModules.courseId, course.id));
      for (const [sortOrder, section] of input.modules.entries()) {
        await tx.insert(courseModules).values({ id: section.id, courseId: course.id, title: section.title, isPublished: section.isPublished, sortOrder });
        if (section.lessons.length) await tx.insert(courseLessons).values(section.lessons.map((lesson, index) => ({ id: lesson.id, moduleId: section.id, title: lesson.title, sortOrder: index, isPublished: lesson.isPublished, contentType: lesson.contentType, text: lesson.contentType === "text" ? lesson.text : "", videoUrl: lesson.contentType === "video" ? lesson.videoUrl : "", materialId: lesson.contentType === "material" ? lesson.materialId : null })));
      }
      const updatedAt = new Date(Math.max(Date.now(), course.updatedAt.getTime() + 1));
      await tx.update(courses).set({ updatedAt }).where(eq(courses.id, course.id));
      await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.curriculum_saved", entityType: "course", entityId: course.id, metadata: { modules: input.modules.length, lessons: input.modules.reduce((sum, section) => sum + section.lessons.length, 0) } });
      return Response.json({ ok: true, updatedAt });
    });
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } })?.cause?.code || (error as { code?: string })?.code;
    if (code === "23505" || code === "23503") return fail("A curriculum identifier or material changed. Reload before saving.", 409);
    return adminErrorResponse(error);
  }
}
