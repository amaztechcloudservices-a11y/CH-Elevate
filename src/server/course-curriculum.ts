import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { courseLessons, courseMaterials, courseModules, courses } from "@/db/schema";
import { getDb } from "./db";

export async function readCourseCurriculum(courseId: string) {
  const db = getDb();
  const [course] = await db.select({ id: courses.id, title: courses.title, updatedAt: courses.updatedAt }).from(courses).where(eq(courses.id, courseId)).limit(1);
  if (!course) return null;
  const modules = await db.select().from(courseModules).where(eq(courseModules.courseId, courseId)).orderBy(asc(courseModules.sortOrder));
  const lessons = modules.length ? await db.select().from(courseLessons).where(inArray(courseLessons.moduleId, modules.map((section) => section.id))).orderBy(asc(courseLessons.sortOrder)) : [];
  const materials = await db.select({ id: courseMaterials.id, title: courseMaterials.title }).from(courseMaterials).where(and(eq(courseMaterials.courseId, courseId), isNull(courseMaterials.offeringId), isNull(courseMaterials.recipientProfileId), eq(courseMaterials.isArchived, false))).orderBy(asc(courseMaterials.title));
  return { course, modules: modules.map(({ id, title, isPublished }) => ({ id, title, isPublished, lessons: lessons.filter((lesson) => lesson.moduleId === id).map(({ id, title, contentType, text, videoUrl, materialId, isPublished }) => ({ id, title, contentType, text, videoUrl, materialId, isPublished })) })), materials };
}
