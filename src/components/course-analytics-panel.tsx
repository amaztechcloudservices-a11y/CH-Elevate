"use client";
import { useEffect, useState, type FormEvent } from "react";
import { analyticsFilterSchema, defaultAnalyticsFilters, type CourseAnalytics } from "@/lib/course-analytics";
import { CourseCountBars, MonthlyCourseChart } from "./course-analytics-charts";

export function CourseAnalyticsPanel({ courses }: { courses: { id: string; title: string }[] }) {
  const [draft, setDraft] = useState(defaultAnalyticsFilters);
  const [query, setQuery] = useState(() => ({ filters: defaultAnalyticsFilters(), revision: 0 }));
  const [data, setData] = useState<CourseAnalytics | null>(null); const [error, setError] = useState(""); const [filterError, setFilterError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/courses/analytics?${new URLSearchParams(query.filters)}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await response.json(); if (!response.ok || !body.data) throw new Error(body.error?.message || "Analytics could not be loaded.");
      if (!controller.signal.aborted) setData(body.data);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Analytics could not be loaded."); });
    return () => controller.abort();
  }, [query]);
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const parsed = analyticsFilterSchema.safeParse(draft);
    if (!parsed.success) { setFilterError(parsed.error.issues[0]?.message || "Check the selected dates."); return; }
    setFilterError(""); setError(""); setData(null); setQuery({ filters: parsed.data, revision: query.revision + 1 });
  }
  const metrics = data && [["Applications", data.totals.applications], ["Participant records", data.totals.participants], ["Approved incl. completed", data.totals.approved], ["Pending review", data.totals.pending], ["Waitlisted", data.totals.waitlisted], ["Completed", data.totals.completed]] as const;
  return <section className="course-analytics" aria-label="Course analytics">
    <div className="cms-card"><h2>Course analytics</h2><p>Review registration trends and current participant outcomes. Figures use application submission dates, not course start dates.</p>
      <form className="analytics-filters" onSubmit={apply}>
        <label><span>Analytics course</span><select value={draft.courseId} onChange={(event) => setDraft({ ...draft, courseId: event.target.value })}><option value="">All courses</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
        <label><span>Submitted from (Jamaica)</span><input type="date" required value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} /></label>
        <label><span>Submitted through (Jamaica)</span><input type="date" required value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} /></label>
        <button type="submit">Apply analytics filters</button>
      </form>
      <p>Both dates are inclusive. Choose up to five years per report. Changing fields does not change the results until you apply them.</p>
      {filterError && <p role="alert">{filterError}</p>}
    </div>
    {error ? <div className="cms-card"><p role="alert">{error}</p><button onClick={() => { setError(""); setData(null); setQuery({ ...query, revision: query.revision + 1 }); }}>Retry analytics</button></div> : !data ? <div className="cms-card" role="status">Loading course analytics…</div> : <>
      <div className="analytics-applied"><p><strong>Applied: {data.courseTitle}</strong><span>{data.filters.from} through {data.filters.to} · {data.timeZone}</span><span>Snapshot: {new Date(data.generatedAt).toLocaleString("en-JM", { timeZone: data.timeZone })}</span></p><a className="analytics-download" href={`/api/admin/courses/analytics?${new URLSearchParams({ ...data.filters, format: "csv" })}`} download>Download summary CSV</a></div>
      <p className="analytics-definition">Applications count each group once; participants count enrolment records, not unique people. Approved includes completed. The CSV uses these applied filters and a fresh saved-data snapshot.</p>
      <dl className="analytics-metrics">{metrics && metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {!data.totals.applications && <p className="cms-card" role="status">No applications were submitted for these filters.</p>}
      <div className="analytics-charts"><MonthlyCourseChart rows={data.monthly} /><CourseCountBars title="Participant status" values={data.statuses} unit="Participant records by their current status" /><CourseCountBars title="Attendance" values={data.attendance} unit="Recorded attendance for these participant records" /><CourseCountBars title="Payment status" values={data.payments} unit="Applications counted once per group. Status counts, not revenue or outstanding balances." /></div>
      <section className="cms-card" aria-label="Course comparison"><h3>Course comparison</h3><p>{data.totals.courses} courses with applications in the applied period, including archived courses. Courses with no applications are not listed.</p><div className="analytics-table-scroll"><table><caption>Registration totals by course</caption><thead><tr><th scope="col">Course</th><th scope="col">Applications</th><th scope="col">Participants</th><th scope="col">Approved incl. completed</th><th scope="col">Completed</th></tr></thead><tbody>{data.courses.map((course) => <tr key={course.courseId}><th scope="row">{course.title}</th><td>{course.applications}</td><td>{course.participants}</td><td>{course.approved}</td><td>{course.completed}</td></tr>)}</tbody></table></div></section>
    </>}
  </section>;
}
