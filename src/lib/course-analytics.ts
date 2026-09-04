import { z } from "zod";
export const analyticsTimeZone = "America/Jamaica";
const analyticsDate = z.iso.date().refine((value) => value >= "1900-01-01" && value <= "9998-12-31", "Choose a date between 1900 and 9998.");
export const analyticsFilterSchema = z.object({
  courseId: z.union([z.uuid(), z.literal("")]).default(""), from: analyticsDate, to: analyticsDate,
}).strict().refine((value) => value.from <= value.to, "The end date must be on or after the start date.")
  .refine((value) => Date.parse(value.to) - Date.parse(value.from) <= 1826 * 86400000, "Choose a date range of up to five years.");
export type AnalyticsFilters = z.infer<typeof analyticsFilterSchema>;
export const participantStatuses = ["pending_review", "approved", "waitlisted", "rejected", "cancelled", "completed"] as const;
export const attendanceStatuses = ["not_recorded", "attended", "partially_attended", "no_show"] as const;
export const paymentStatuses = ["unpaid", "invoiced", "partially_paid", "paid", "waived", "refunded"] as const;
export type ApplicationBucket = { courseId: string; title: string; month: string; payment: string; count: number };
export type ParticipantBucket = { courseId: string; month: string; status: string; attendance: string; count: number };
export function defaultAnalyticsFilters(now = new Date()): AnalyticsFilters {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: analyticsTimeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((part) => [part.type, part.value]));
  return { courseId: "", from: `${parts.year}-01-01`, to: `${parts.year}-${parts.month}-${parts.day}` };
}
export function analyticsBounds(filters: AnalyticsFilters) {
  // Jamaica has a fixed UTC-05 offset. End dates are inclusive local calendar dates.
  return { start: new Date(`${filters.from}T00:00:00-05:00`), end: new Date(new Date(`${filters.to}T00:00:00-05:00`).getTime() + 86400000) };
}
export function summarizeCourseAnalytics(filters: AnalyticsFilters, courseTitle: string, applications: ApplicationBucket[], participants: ParticipantBucket[], generatedAt = new Date()) {
  const monthly: { month: string; applications: number; participants: number }[] = [];
  const first = new Date(`${filters.from.slice(0, 7)}-01T00:00:00Z`); const last = filters.to.slice(0, 7);
  for (let cursor = first; cursor.toISOString().slice(0, 7) <= last; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) monthly.push({ month: cursor.toISOString().slice(0, 7), applications: 0, participants: 0 });
  const months = new Map(monthly.map((row) => [row.month, row]));
  const courses = new Map<string, { courseId: string; title: string; applications: number; participants: number; approved: number; completed: number }>();
  const statuses = Object.fromEntries(participantStatuses.map((status) => [status, 0]));
  const attendance = Object.fromEntries(attendanceStatuses.map((status) => [status, 0]));
  const payments = Object.fromEntries(paymentStatuses.map((status) => [status, 0]));
  for (const row of applications) {
    const course = courses.get(row.courseId) || { courseId: row.courseId, title: row.title, applications: 0, participants: 0, approved: 0, completed: 0 };
    course.applications += row.count; courses.set(row.courseId, course);
    const month = months.get(row.month); if (month) month.applications += row.count;
    payments[row.payment] = (payments[row.payment] || 0) + row.count;
  }
  for (const row of participants) {
    const course = courses.get(row.courseId); if (!course) continue;
    course.participants += row.count; if (["approved", "completed"].includes(row.status)) course.approved += row.count; if (row.status === "completed") course.completed += row.count;
    const month = months.get(row.month); if (month) month.participants += row.count;
    statuses[row.status] = (statuses[row.status] || 0) + row.count; attendance[row.attendance] = (attendance[row.attendance] || 0) + row.count;
  }
  const courseRows = [...courses.values()].sort((a, b) => b.participants - a.participants || a.title.localeCompare(b.title) || a.courseId.localeCompare(b.courseId));
  return { filters, courseTitle, timeZone: analyticsTimeZone, generatedAt: generatedAt.toISOString(),
    totals: { applications: applications.reduce((sum, row) => sum + row.count, 0), participants: participants.reduce((sum, row) => sum + row.count, 0), courses: courseRows.length, approved: statuses.approved + statuses.completed, completed: statuses.completed, pending: statuses.pending_review, waitlisted: statuses.waitlisted },
    monthly, statuses, attendance, payments, courses: courseRows,
  };
}
export type CourseAnalytics = ReturnType<typeof summarizeCourseAnalytics>;
export function analyticsCsv(report: CourseAnalytics) {
  const rows: (string | number)[][] = [
    ["Section", "Course ID", "Course", "Period or status", "Applications", "Participants", "Count"],
    ["Report", report.filters.courseId, report.courseTitle, `${report.filters.from} through ${report.filters.to} (${report.timeZone}; application submission date)`, "", "", ""],
    ["Generated at", "", "", report.generatedAt, "", "", ""],
    ["Totals", "", "", "", report.totals.applications, report.totals.participants, ""],
    ...Object.entries(report.totals).filter(([key]) => !["applications", "participants"].includes(key)).map(([key, value]) => ["Metric", "", "", key, "", "", value]),
    ...report.monthly.map((row) => ["Monthly", "", "", row.month, row.applications, row.participants, ""]),
    ...report.courses.map((row) => ["Course", row.courseId, row.title, "", row.applications, row.participants, ""]),
    ...report.courses.flatMap((row) => [["Course approved incl completed", row.courseId, row.title, "", "", "", row.approved], ["Course completed", row.courseId, row.title, "", "", "", row.completed]]),
    ...Object.entries(report.statuses).map(([status, count]) => ["Participant status", "", "", status, "", "", count]),
    ...Object.entries(report.attendance).map(([status, count]) => ["Participant attendance", "", "", status, "", "", count]),
    ...Object.entries(report.payments).map(([status, count]) => ["Application payment status", "", "", status, "", "", count]),
    ["Definitions", "", "", "Applications counted once per group; participants count enrolment records, not unique people. Approved includes completed. Payment statuses are not revenue or outstanding balances.", "", "", ""],
  ];
  const cell = (value: string | number) => { let text = String(value).replace(/[\u0000-\u001f\u007f]/g, " "); if (/^[=+@-]/.test(text.trimStart())) text = `'${text}`; return `"${text.replaceAll('"', '""')}"`; };
  return "\ufeff" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
