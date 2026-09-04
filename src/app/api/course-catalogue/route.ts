import { and, asc, eq, ne } from "drizzle-orm";
import { cmsDocuments, courseCategories, courses, profiles } from "@/db/schema";
import { courseCatalogueSectionSchema, defaultCourseCatalogueSection } from "@/lib/course-catalogue";
import { getDb } from "@/server/db";

export async function GET() {
  try {
    const db = getDb();
    const [data, sectionRows] = await Promise.all([db.select({
      id: courses.id, title: courses.title, slug: courses.slug, subtitle: courses.subtitle,
      summary: courses.summary, description: courses.description, bannerUrl: courses.bannerUrl,
      category: courseCategories.name, instructor: profiles.displayName, skillLevel: courses.skillLevel,
      accessType: courses.accessType, priceCents: courses.priceCents, currency: courses.currency, subscription: courses.subscription,
    }).from(courses).leftJoin(courseCategories, eq(courses.categoryId, courseCategories.id))
      .leftJoin(profiles, eq(courses.instructorId, profiles.id))
      .where(and(eq(courses.status, "published"), eq(courses.isActive, true), ne(courses.accessType, "private")))
      .orderBy(asc(courses.title)), db.select().from(cmsDocuments).where(eq(cmsDocuments.key, "course_catalogue_section")).limit(1)]);
    const section = sectionRows[0] ? courseCatalogueSectionSchema.parse(sectionRows[0].data) : defaultCourseCatalogueSection;
    return Response.json({ ok: true, data: data.map((course) => ({ ...course, subscription: course.accessType === "subscription" ? course.subscription : "" })), section }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ ok: false, error: "The course catalogue is temporarily unavailable." }, { status: 503 }); }
}
