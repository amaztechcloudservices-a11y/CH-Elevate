import { and, count, eq, inArray, ne } from "drizzle-orm";
import { courseOfferings, courses, registrationParticipants } from "@/db/schema";
import type { getDb } from "@/server/db";
type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

// Lock order for capacity-changing operations: course, offering, registration/participants.
// The catalogue editor also locks the course, so limits cannot change mid-approval.
export async function lockCourseOffering(tx: Transaction, offeringId: string) {
  const [identity] = await tx.select({ courseId: courseOfferings.courseId }).from(courseOfferings).where(eq(courseOfferings.id, offeringId));
  if (!identity) return null;
  const [course] = await tx.select().from(courses).where(eq(courses.id, identity.courseId)).for("update");
  const [offering] = await tx.select().from(courseOfferings).where(eq(courseOfferings.id, offeringId)).for("update");
  return course && offering ? { course, offering } : null;
}

export async function courseEnrolmentCount(tx: Transaction, courseId: string, excludeRegistrationId?: string) {
  const [row] = await tx.select({ value: count() }).from(registrationParticipants)
    .innerJoin(courseOfferings, eq(courseOfferings.id, registrationParticipants.offeringId))
    .where(and(eq(courseOfferings.courseId, courseId), inArray(registrationParticipants.status, ["approved", "completed"]), excludeRegistrationId ? ne(registrationParticipants.registrationId, excludeRegistrationId) : undefined));
  return row.value;
}
