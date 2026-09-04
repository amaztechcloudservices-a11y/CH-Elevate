"use client";

import { FormEvent, useRef, useState } from "react";

type Row = {
  participantId: string; participantName: string; participantEmail: string; participantStatus: string;
  courseTitle: string; offeringCode: string;
  registration: { id: string; status: string; organisationId?: string | null; applicantName?: string; applicantEmail?: string };
};

export function CourseAccessEmail({ registrations }: { registrations: Row[] }) {
  const [selected, setSelected] = useState(""); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""); const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);
  const options = new Map<string, { label: string; email: string; body: object }>();
  for (const row of registrations) {
    if (!["approved", "completed"].includes(row.registration.status)) continue;
    const context = `${row.courseTitle} (${row.offeringCode})`;
    if (["approved", "completed"].includes(row.participantStatus)) options.set(row.participantId, { label: `${row.participantName} — ${context}`, email: row.participantEmail, body: { recipient: "participant", participantId: row.participantId, registrationId: row.registration.id } });
    if (row.registration.organisationId && row.registration.applicantEmail) options.set(`${row.registration.id}:coordinator`, { label: `Coordinator: ${row.registration.applicantName || row.registration.applicantEmail} — ${context}`, email: row.registration.applicantEmail, body: { recipient: "coordinator", registrationId: row.registration.id } });
  }
  const recipient = options.get(selected);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!recipient || inFlight.current) return;
    inFlight.current = true; setBusy(true); setFailed(false); setMessage("");
    try {
      const response = await fetch("/api/admin/courses/access-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(recipient.body) });
      const result = await response.json() as { message?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message || "The access email could not be sent.");
      setMessage(result.message || "Access email sent.");
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "The access email could not be sent. Please retry."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <form className="cms-card course-admin-form" onSubmit={submit}>
    <div className="cms-card__heading"><h2>Course access email</h2></div>
    <p>Send access to an approved student or coordinator without repeating approval. A new activation link replaces older unused invitations and expires in 7 days. Accounts with access receive a sign-in link.</p>
    <label><span>Access email recipient</span><select required disabled={busy} value={selected} onChange={(event) => { setSelected(event.target.value); setMessage(""); }}>
      <option value="">Select an approved recipient</option>
      {[...options].map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
    </select></label>
    {recipient && <p>The access email will be sent to {recipient.email}.</p>}
    <button type="submit" disabled={!recipient || busy}>{busy ? "Sending access email…" : "Send access email"}</button>
    {message && <p role={failed ? "alert" : "status"}>{message}</p>}
  </form>;
}
