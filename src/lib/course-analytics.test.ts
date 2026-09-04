import { expect, it } from "vitest";
import { analyticsBounds, analyticsCsv, analyticsFilterSchema, defaultAnalyticsFilters, summarizeCourseAnalytics } from "./course-analytics";
const filters = { courseId: "", from: "2026-01-01", to: "2026-03-31" };
it("validates real dates, order, five-year range and Jamaica date boundaries", () => {
  for (const invalid of [{ ...filters, from: "2026-02-30" }, { ...filters, to: "2025-01-01" }, { ...filters, to: "2032-01-01" }, { ...filters, courseId: "unknown" }, { ...filters, extra: true }]) expect(analyticsFilterSchema.safeParse(invalid).success).toBe(false);
  expect(analyticsFilterSchema.safeParse(filters).success).toBe(true);
  expect(analyticsBounds({ ...filters, from: "2026-01-01", to: "2026-01-01" })).toEqual({ start: new Date("2026-01-01T05:00:00Z"), end: new Date("2026-01-02T05:00:00Z") });
  expect(defaultAnalyticsFilters(new Date("2026-01-01T03:00:00Z"))).toEqual({ courseId: "", from: "2025-01-01", to: "2025-12-31" });
});
it("distinguishes groups, participants and payment statuses and fills zero months", () => {
  const data = summarizeCourseAnalytics(filters, "All courses", [{ courseId: "one", title: "Leadership", month: "2026-01", payment: "paid", count: 2 }], [{ courseId: "one", month: "2026-01", status: "approved", attendance: "not_recorded", count: 5 }, { courseId: "one", month: "2026-01", status: "completed", attendance: "attended", count: 1 }]);
  expect(data.totals).toEqual({ applications: 2, participants: 6, courses: 1, approved: 6, completed: 1, pending: 0, waitlisted: 0 });
  expect(data.payments.paid).toBe(2); expect(data.monthly).toHaveLength(3); expect(data.monthly[1]).toEqual({ month: "2026-02", applications: 0, participants: 0 });
  expect(data.courses[0]).toMatchObject({ applications: 2, participants: 6, approved: 6, completed: 1 });
});
it("returns zero totals for no data and escapes spreadsheet formula content", () => {
  const empty = summarizeCourseAnalytics(filters, "All courses", [], []); expect(empty.totals.participants).toBe(0); expect(empty.monthly.every((row) => row.participants === 0)).toBe(true);
  const report = summarizeCourseAnalytics(filters, " =HYPERLINK(\"bad\")", [{ courseId: "one", title: "+CMD,\"test\"", month: "2026-01", payment: "unpaid", count: 1 }], []);
  const csv = analyticsCsv(report); expect(csv).toContain("' =HYPERLINK"); expect(csv).toContain("'+CMD,\"\"test\"\""); expect(csv).toContain('"unpaid","","","1"'); expect(csv.startsWith("\ufeff")).toBe(true);
});
