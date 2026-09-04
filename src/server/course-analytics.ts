import { and, count, eq, gte, lt, sql } from "drizzle-orm";
import { courseOfferings, courseRegistrations, courses, registrationParticipants } from "@/db/schema";
import { analyticsBounds, summarizeCourseAnalytics, type AnalyticsFilters } from "@/lib/course-analytics";
import { getDb } from "@/server/db";

export async function readCourseAnalytics(filters: AnalyticsFilters) {
  const { start, end } = analyticsBounds(filters);
  const condition = and(gte(courseRegistrations.createdAt, start), lt(courseRegistrations.createdAt, end), filters.courseId ? eq(courses.id, filters.courseId) : undefined);
  const month = sql<string>`to_char(${courseRegistrations.createdAt} at time zone 'America/Jamaica', 'YYYY-MM')`;
  // All aggregates use one read-only snapshot, without fetching participant PII.
  return getDb().transaction(async (tx) => {
    let courseTitle = "All courses";
    if (filters.courseId) {
      const [course] = await tx.select({ title: courses.title }).from(courses).where(eq(courses.id, filters.courseId)).limit(1);
      if (!course) return null; courseTitle = course.title;
    }
    const applications = await tx.select({ courseId: courses.id, title: courses.title, month, payment: courseRegistrations.paymentStatus, count: count() })
      .from(courseRegistrations).innerJoin(courseOfferings, eq(courseOfferings.id, courseRegistrations.offeringId)).innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .where(condition).groupBy(courses.id, courses.title, month, courseRegistrations.paymentStatus);
    const participants = await tx.select({ courseId: courses.id, month, status: registrationParticipants.status, attendance: registrationParticipants.attendance, count: count() })
      .from(courseRegistrations).innerJoin(courseOfferings, eq(courseOfferings.id, courseRegistrations.offeringId)).innerJoin(courses, eq(courses.id, courseOfferings.courseId))
      .innerJoin(registrationParticipants, and(eq(registrationParticipants.registrationId, courseRegistrations.id), eq(registrationParticipants.offeringId, courseOfferings.id)))
      .where(condition).groupBy(courses.id, month, registrationParticipants.status, registrationParticipants.attendance);
    return summarizeCourseAnalytics(filters, courseTitle, applications, participants);
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}
