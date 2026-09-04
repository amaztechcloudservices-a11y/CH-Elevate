import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { courseLessons, courseMaterials, courseModules, courseOfferings, courses, registrationParticipants } from "@/db/schema";
import { getDb } from "@/server/db";
import { portalErrorResponse, requirePortalProfile } from "@/server/portal-auth";

export async function GET(request: Request) {
  try {
    const { profile } = await requirePortalProfile(request);
    const db = getDb();
    // Learning access is personal; coordinating another person's registration does not enrol the coordinator.
    const enrolled = await db.selectDistinct({ id: courses.id, title: courses.title }).from(registrationParticipants)
      .innerJoin(courseOfferings, eq(courseOfferings.id, registrationParticipants.offeringId))
      .innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .where(and(eq(registrationParticipants.profileId, profile.id), inArray(registrationParticipants.status, ["approved", "completed"]))).orderBy(asc(courses.title));
    const ids = enrolled.map((course) => course.id);
    if (!ids.length) return Response.json({ ok: true, data: [] }, { headers: { "Cache-Control": "private, no-store" } });
    const modules = await db.select().from(courseModules).where(and(inArray(courseModules.courseId, ids), eq(courseModules.isPublished, true))).orderBy(asc(courseModules.sortOrder));
    const lessons = modules.length ? await db.select().from(courseLessons).where(and(inArray(courseLessons.moduleId, modules.map((section) => section.id)), eq(courseLessons.isPublished, true))).orderBy(asc(courseLessons.sortOrder)) : [];
    const materials = await db.select({ id: courseMaterials.id, courseId: courseMaterials.courseId }).from(courseMaterials).where(and(inArray(courseMaterials.courseId, ids), eq(courseMaterials.isArchived, false), isNull(courseMaterials.offeringId), isNull(courseMaterials.recipientProfileId)));
    const data = enrolled.map((course) => ({ ...course, modules: modules.filter((section) => section.courseId === course.id).map((section) => ({ id: section.id, title: section.title,
      lessons: lessons.filter((lesson) => lesson.moduleId === section.id && (lesson.contentType !== "material" || materials.some((material) => material.id === lesson.materialId && material.courseId === course.id))).map((lesson) => ({ id: lesson.id, title: lesson.title, contentType: lesson.contentType, text: lesson.text, videoUrl: lesson.videoUrl, downloadUrl: lesson.contentType === "material" ? `/api/portal/downloads/material/${lesson.materialId}` : null })),
    })) }));
    return Response.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return portalErrorResponse(error); }
}
