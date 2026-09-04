"use client";

import { FormEvent, useState } from "react";

type Participant = { participantId: string; participantName: string; participantEmail: string };

export function StudentPasswordReset({ participants }: { participants: Participant[] }) {
  const [participantId, setParticipantId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const students = [...new Map(participants.map((row) => [row.participantEmail.toLowerCase(), row])).values()];
  const selected = students.find((row) => row.participantId === participantId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setFailed(false);
    setMessage("");
    try {
      const response = await fetch("/api/admin/courses/password-reset", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participantId }),
      });
      const result = await response.json() as { message?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message || "The reset email could not be sent.");
      setMessage(result.message || "Reset email sent.");
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "The reset email could not be sent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="cms-card course-admin-form" onSubmit={submit}>
    <div className="cms-card__heading"><h2>Student password recovery</h2></div>
    <p>Send an expiring reset link to a student’s registered email. They choose their own password; existing sessions end after the reset.</p>
    <label><span>Student account</span><select value={participantId} onChange={(event) => { setParticipantId(event.target.value); setMessage(""); }} required disabled={busy}>
      <option value="">Select a student</option>
      {students.map((row) => <option key={row.participantId} value={row.participantId}>{row.participantName} — {row.participantEmail}</option>)}
    </select></label>
    {selected && <p>The reset link will be sent to {selected.participantEmail}.</p>}
    <button type="submit" disabled={!selected || busy}>{busy ? "Sending reset email…" : "Send password reset email"}</button>
    {message && <p role={failed ? "alert" : "status"}>{message}</p>}
  </form>;
}
