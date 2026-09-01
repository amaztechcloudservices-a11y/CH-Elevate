import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";

import { auditLogs, courseMaterials, courseOfferings, courses } from "@/db/schema";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { CourseFileError, savePrivateFile } from "@/server/course-storage";
import { getDb } from "@/server/db";

const metadataSchema = z.object({ title: z.string().trim().min(2).max(180), courseId: z.uuid(), offeringId: z.union([z.uuid(), z.literal("")]).optional().default("") });

export async function POST(request: Request) {
  try {
    const { session } = await requireClientAdmin(request);
    const form = await request.formData();
    const parsed = metadataSchema.safeParse({ title: form.get("title"), courseId: form.get("courseId"), offeringId: form.get("offeringId") });
    const file = form.get("file");
    if (!parsed.success || !(file instanceof File)) return Response.json({ ok: false, error: { message: parsed.success ? "Choose a file." : parsed.error.issues[0]?.message } }, { status: 422 });
    if (parsed.data.offeringId) {
      const [offering] = await getDb().select({ courseId: courseOfferings.courseId }).from(courseOfferings).where(eq(courseOfferings.id, parsed.data.offeringId)).limit(1);
      if (!offering || offering.courseId !== parsed.data.courseId) return Response.json({ ok: false, error: { message: "The offering does not belong to the selected course." } }, { status: 422 });
    } else {
      const [course] = await getDb().select({ id: courses.id }).from(courses).where(eq(courses.id, parsed.data.courseId)).limit(1);
      if (!course) return Response.json({ ok: false, error: { message: "Course not found." } }, { status: 404 });
    }
    const stored = await savePrivateFile(file, "materials");
    const [previous] = await getDb().select({ version: courseMaterials.version }).from(courseMaterials).where(and(eq(courseMaterials.courseId, parsed.data.courseId), parsed.data.offeringId ? eq(courseMaterials.offeringId, parsed.data.offeringId) : isNull(courseMaterials.offeringId), eq(courseMaterials.title, parsed.data.title))).orderBy(desc(courseMaterials.version)).limit(1);
    const [material] = await getDb().insert(courseMaterials).values({ ...stored, title: parsed.data.title, courseId: parsed.data.courseId, offeringId: parsed.data.offeringId || null, version: (previous?.version || 0) + 1 }).returning();
    if (previous) await getDb().update(courseMaterials).set({ isArchived: true }).where(and(eq(courseMaterials.courseId, parsed.data.courseId), parsed.data.offeringId ? eq(courseMaterials.offeringId, parsed.data.offeringId) : isNull(courseMaterials.offeringId), eq(courseMaterials.title, parsed.data.title), eq(courseMaterials.isArchived, false), ne(courseMaterials.id, material.id)));
    await getDb().insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.material_uploaded", entityType: "course_material", entityId: material.id, metadata: { courseId: parsed.data.courseId, offeringId: parsed.data.offeringId || null, version: material.version } });
    return Response.json({ ok: true, data: material }, { status: 201 });
  } catch (error) {
    if (error instanceof CourseFileError) return Response.json({ ok: false, error: { message: error.message } }, { status: 422 });
    return adminErrorResponse(error);
  }
}
