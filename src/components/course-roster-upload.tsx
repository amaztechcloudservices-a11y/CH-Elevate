"use client";

import { useRef, useState, type FormEvent } from "react";

type Offering = { courseTitle: string; offering: { id: string; code: string; isCancelled: boolean } };
export function CourseRosterUpload({ offerings, refresh, onMessage }: { offerings: Offering[]; refresh: () => Promise<boolean>; onMessage: (message: string) => void }) {
  const [busy, setBusy] = useState(false); const inFlight = useRef(false);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current) return;
    const element = event.currentTarget; const form = new FormData(element); const file = form.get("file");
    if (!(file instanceof File) || !file.size || file.size > 1024 * 1024 || !/\.csv$/i.test(file.name)) { onMessage("Choose a UTF-8 CSV file between 1 byte and 1 MB."); return; }
    inFlight.current = true; setBusy(true); onMessage("Importing participant roster…");
    try {
      const response = await fetch("/api/admin/courses/roster", { method: "POST", body: form });
      const result = await response.json().catch(() => null) as { data?: { participantCount: number }; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(result?.error?.message || "Roster import failed. Your details have been kept for retry.");
      element.reset();
      const count = result?.data?.participantCount;
      try {
        if (!await refresh()) throw new Error("Refresh failed");
        onMessage(typeof count === "number" ? `${count} participant${count === 1 ? "" : "s"} imported for administrator review.` : "Roster imported for administrator review.");
      } catch { onMessage("Roster imported, but the list could not refresh. Refresh the page; do not import it again."); }
    } catch (error) { onMessage(error instanceof Error ? error.message : "Roster import failed. Your details have been kept for retry."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <form className="cms-card course-admin-form" onSubmit={upload} aria-busy={busy}>
    <div className="cms-card__heading"><h2>Import organisation roster</h2></div>
    <p>UTF-8 CSV, up to 1 MB and 250 participants. Required headers: name,email. Optional header: phone. Quote names containing commas. All rows must be valid; imported seats remain pending review.</p>
    <label><span>Offering</span><select name="offeringId" required disabled={busy}><option value="">Select offering</option>{offerings.filter((row) => !row.offering.isCancelled).map((row) => <option key={row.offering.id} value={row.offering.id}>{row.courseTitle} · {row.offering.code}</option>)}</select></label>
    <label><span>Organisation</span><input name="organisationName" required minLength={2} maxLength={180} disabled={busy} /></label>
    <label><span>Coordinator name</span><input name="applicantName" required minLength={2} maxLength={120} disabled={busy} /></label>
    <label><span>Coordinator email</span><input name="applicantEmail" type="email" required maxLength={254} disabled={busy} /></label>
    <label><span>Roster CSV</span><input name="file" type="file" accept=".csv,text/csv" required disabled={busy} /></label>
    <button type="submit" disabled={busy}>{busy ? "Importing…" : "Import roster"}</button>
  </form>;
}
