import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { auditLogs, cmsDocuments, courseCategories, courseMaterials, courseModules, courseOfferings, courses, profiles } from "@/db/schema";
import { courseCatalogueSchema, courseCatalogueSectionSchema, defaultCourseCatalogueSection } from "@/lib/course-catalogue";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { getDb } from "@/server/db";
import { courseEnrolmentCount } from "@/server/course-enrolment";

const fail = (message: string, status: number) => Response.json({ ok: false, error: { message } }, { status });
const identity = { id: z.uuid(), updatedAt: z.iso.datetime() };
const mutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), data: courseCatalogueSchema }).strict(),
  z.object({ action: z.literal("update"), ...identity, data: courseCatalogueSchema }).strict(),
  z.object({ action: z.literal("duplicate"), ...identity }).strict(),
  z.object({ action: z.literal("delete"), ...identity }).strict(),
  z.object({ action: z.literal("category"), name: z.string().trim().min(2).max(80) }).strict(),
  z.object({ action: z.literal("section"), updatedAt: z.iso.datetime().nullable(), data: courseCatalogueSectionSchema }).strict(),
]);
export async function GET(request: Request) {
  try {
    await requireClientAdmin(request);
    const db = getDb();
    const [data, categories, instructors, sectionRows] = await Promise.all([
      db.select().from(courses).orderBy(asc(courses.title)),
      db.select().from(courseCategories).orderBy(asc(courseCategories.name)),
      db.select({ id: profiles.id, name: profiles.displayName }).from(profiles).where(and(eq(profiles.active, true), inArray(profiles.role, ["client_admin", "staff"]))).orderBy(asc(profiles.displayName)),
      db.select().from(cmsDocuments).where(eq(cmsDocuments.key, "course_catalogue_section")).limit(1),
    ]);
    const storedSection = sectionRows[0];
    const section = storedSection
      ? { ...courseCatalogueSectionSchema.parse(storedSection.data), updatedAt: storedSection.updatedAt.toISOString() }
      : { ...defaultCourseCatalogueSection, updatedAt: null };
    return Response.json({ ok: true, data, categories, instructors, section }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const { session } = await requireClientAdmin(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) return fail("A same-origin request is required.", 403);
    const parsed = mutation.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Review the course fields.", 422);
    const input = parsed.data;
    return await getDb().transaction(async (tx) => {
      let result;
      if (input.action === "section") {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ch-elevate-course-catalogue-section'))`);
        const [existing] = await tx.select().from(cmsDocuments).where(eq(cmsDocuments.key, "course_catalogue_section")).for("update");
        const existingUpdatedAt = existing?.updatedAt.toISOString() ?? null;
        if (existingUpdatedAt !== input.updatedAt) return fail("These catalogue section settings changed in another window. Reload before continuing.", 409);
        const updatedAt = new Date(Math.max(Date.now(), (existing?.updatedAt.getTime() ?? 0) + 1));
        if (existing) {
          await tx.update(cmsDocuments).set({ data: input.data, updatedByAuthUserId: session.user.id, updatedAt }).where(eq(cmsDocuments.key, "course_catalogue_section"));
        } else {
          await tx.insert(cmsDocuments).values({ key: "course_catalogue_section", documentType: "course_catalogue_section", data: input.data, updatedByAuthUserId: session.user.id, updatedAt });
        }
        result = { ...input.data, updatedAt: updatedAt.toISOString() };
      } else if (input.action === "category") {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ch-elevate-course-categories'))`);
        const [existing] = await tx.select().from(courseCategories).where(sql`lower(${courseCategories.name}) = lower(${input.name})`).limit(1);
        if (existing) return fail("That category already exists.", 409);
        [result] = await tx.insert(courseCategories).values({ name: input.name }).returning();
      } else {
        if (input.action === "create" || input.action === "update") {
          if (input.data.instructorId) {
            const [instructor] = await tx.select({ id: profiles.id }).from(profiles).where(and(eq(profiles.id, input.data.instructorId), eq(profiles.active, true), inArray(profiles.role, ["client_admin", "staff"]))).limit(1);
            if (!instructor) return fail("Choose an active staff or administrator instructor.", 422);
          }
          if (input.data.categoryId) {
            const [category] = await tx.select({ id: courseCategories.id }).from(courseCategories).where(eq(courseCategories.id, input.data.categoryId)).limit(1);
            if (!category) return fail("Choose an existing category.", 422);
          }
        }
        if (input.action === "create") {
          [result] = await tx.insert(courses).values({ ...input.data, isActive: input.data.status === "published" }).returning();
        } else {
          const [existing] = await tx.select().from(courses).where(eq(courses.id, input.id)).for("update");
          if (!existing) return fail("Course not found.", 404);
          if (existing.updatedAt.toISOString() !== input.updatedAt) return fail("This course changed in another window. Reload before continuing.", 409);
          if (input.action === "delete") {
            const [offering] = await tx.select({ id: courseOfferings.id }).from(courseOfferings).where(eq(courseOfferings.courseId, existing.id)).limit(1);
            const [material] = await tx.select({ id: courseMaterials.id }).from(courseMaterials).where(eq(courseMaterials.courseId, existing.id)).limit(1);
            const [curriculum] = await tx.select({ id: courseModules.id }).from(courseModules).where(eq(courseModules.courseId, existing.id)).limit(1);
            if (offering || material || curriculum) return fail("This course has offerings, materials or curriculum. Archive it to preserve its records.", 409);
            await tx.delete(courses).where(eq(courses.id, existing.id)); result = existing;
          } else if (input.action === "duplicate") {
            const { id: _id, createdAt: _created, updatedAt: _updated, ...copy } = existing;
            void _id; void _created; void _updated;
            [result] = await tx.insert(courses).values({ ...copy, title: `${existing.title.slice(0, 170)} (copy)`, slug: `${existing.slug.slice(0, 140)}-${randomUUID().slice(0, 8)}`, status: "draft", isActive: false }).returning();
          } else {
            if (input.data.enrollmentLimit !== null && input.data.enrollmentLimit < await courseEnrolmentCount(tx, existing.id)) return fail("The enrolment limit cannot be lower than the current approved/completed enrolment count. Release places first or leave it unlimited.", 409);
            [result] = await tx.update(courses).set({ ...input.data, isActive: input.data.status === "published", updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)) }).where(eq(courses.id, existing.id)).returning();
          }
        }
      }
      await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: `course.catalogue_${input.action}`, entityType: input.action === "category" ? "course_category" : input.action === "section" ? "course_catalogue_section" : "course", entityId: input.action === "section" ? "course_catalogue_section" : (result as { id: string }).id });
      return Response.json({ ok: true, data: result }, { status: ["create", "duplicate", "category"].includes(input.action) ? 201 : 200 });
    });
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } })?.cause?.code || (error as { code?: string })?.code;
    if (code === "23505") return fail("That course URL or category already exists.", 409);
    if (code === "23503") return fail("Related records changed. Reload and try again; linked records cannot be deleted.", 409);
    return adminErrorResponse(error);
  }
}
