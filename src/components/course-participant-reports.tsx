"use client";
import { useState } from "react";
import { Download } from "lucide-react";

type Participant = {
  courseId?: string; offeringId?: string; participantId: string; participantName: string; participantEmail: string;
  participantStatus: string; attendance: string; offeringCode: string; organisationName: string | null;
};
type Props = { courses: { id: string; title: string }[]; registrations: Participant[] };
export function CourseParticipantReports({ courses, registrations }: Props) {
  const [filters, setFilters] = useState({ course: "", offering: "", status: "", search: "" });
  const [selection, setSelection] = useState<string[]>([]); const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const courseRows = registrations.filter((row) => row.courseId === filters.course);
  const offerings = [...new Map(courseRows.map((row) => [row.offeringId, row.offeringCode])).entries()];
  const rows = courseRows.filter((row) => (!filters.offering || row.offeringId === filters.offering) && (!filters.status || row.participantStatus === filters.status) && `${row.participantName} ${row.participantEmail} ${row.organisationName || ""}`.toLowerCase().includes(filters.search.trim().toLowerCase())).sort((a, b) => a.participantName.localeCompare(b.participantName) || a.participantId.localeCompare(b.participantId));
  const selected = rows.filter((row) => selection.includes(row.participantId)).map((row) => row.participantId);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 50)));
  function change(key: keyof typeof filters, value: string) {
    setFilters({ ...filters, [key]: value, ...(key === "course" ? { offering: "", status: "", search: "" } : {}) });
    setSelection([]); setPage(1); setError(""); setMessage("");
  }
  async function download() {
    if (busy || !selected.length) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/courses/participants/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: filters.course, participantIds: selected }) });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error?.message || "The report could not be generated."); }
      if (!response.headers.get("content-type")?.startsWith("application/pdf")) throw new Error("The server did not return a PDF. Please try again.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = "course-participants.pdf";
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage(`PDF download started for ${selected.length} selected participant records. Store and share it securely.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The report could not be generated. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="cms-card course-participant-reports" aria-label="Participant reports">
    <h2 id="participant-report-heading">Participant reports</h2>
    <p>Choose a course and select the students to include in a confidential PDF. Each selection is a participant record, not an entire group registration.</p>
    <fieldset disabled={busy}>
      <legend className="sr-only">Participant report filters and selection</legend>
      <div className="participant-report-filters">
        <label><span>Report course</span><select value={filters.course} onChange={(event) => change("course", event.target.value)}><option value="">Select a course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
        <label><span>Report offering</span><select value={filters.offering} disabled={!filters.course} onChange={(event) => change("offering", event.target.value)}><option value="">All offerings</option>{offerings.map(([id, code]) => <option key={id} value={id}>{code}</option>)}</select></label>
        <label><span>Participant status</span><select value={filters.status} disabled={!filters.course} onChange={(event) => change("status", event.target.value)}><option value="">All statuses</option>{["pending_review", "approved", "waitlisted", "rejected", "cancelled", "completed"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
        <label><span>Find participants</span><input type="search" value={filters.search} disabled={!filters.course} maxLength={120} onChange={(event) => change("search", event.target.value)} placeholder="Name, email or organisation" /></label>
      </div>
      <p>Changing a filter clears the selection. Export up to 1,000 records per PDF.</p>
      <div className="participant-report-actions"><button type="button" disabled={!rows.length || rows.length > 1000} onClick={() => { setSelection(rows.map((row) => row.participantId)); setMessage(""); }}>Select all matching ({rows.length})</button><button type="button" disabled={!selected.length} onClick={() => { setSelection([]); setMessage(""); }}>Clear selection</button><button type="button" disabled={!selected.length} onClick={download}><Download aria-hidden="true" /> {busy ? "Generating PDF…" : `Download selected PDF (${selected.length})`}</button></div>
      {rows.length > 1000 && <p>Use the offering, status or search filters to narrow the list, or select individual records.</p>}
      <p aria-live="polite">{rows.length} matching records · {selected.length} selected</p>
      {!filters.course ? <p>Select a course to view its registered participants.</p> : !rows.length ? <p>No participants match these filters.</p> : <>
        <ul className="participant-report-list">{rows.slice((currentPage - 1) * 50, currentPage * 50).map((row) => <li key={row.participantId}>
          <label><input type="checkbox" aria-label={`Include ${row.participantName} (${row.participantEmail})`} checked={selected.includes(row.participantId)} disabled={!selected.includes(row.participantId) && selected.length >= 1000} onChange={(event) => { setSelection(event.target.checked ? [...selected, row.participantId] : selected.filter((id) => id !== row.participantId)); setMessage(""); }} /><span><strong>{row.participantName}</strong><span>{row.participantEmail}</span></span></label>
          <div><strong>{row.offeringCode}</strong><span>{row.organisationName || "Individual"}</span></div>
          <div><span>Status: {row.participantStatus.replaceAll("_", " ")}</span><span>Attendance: {row.attendance.replaceAll("_", " ")}</span></div>
        </li>)}</ul>
        <nav className="participant-report-actions" aria-label="Participant report pages"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous participants</button><span>Page {currentPage} of {Math.ceil(rows.length / 50)}</span><button type="button" disabled={currentPage * 50 >= rows.length} onClick={() => setPage(currentPage + 1)}>Next participants</button></nav>
      </>}
    </fieldset>
    {error && <p role="alert">{error} Your selection has been retained.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}
