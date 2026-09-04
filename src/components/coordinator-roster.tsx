"use client";
import { FormEvent, useRef, useState } from "react";

export type CoordinatorRegistration = {
  participant: { id: string; name: string; email: string; status: string; updatedAt: string };
  registration: { id: string; organisationId: string | null; status: string; changesOpen: boolean };
  offering: { code: string; startsAt: string; substitutionCutoffAt: string | null; isCancelled: boolean };
  course: { title: string }; organisationName: string | null;
};
export function CoordinatorRoster({ registrations, memberships, onRefresh }: { registrations: CoordinatorRegistration[]; memberships: { organisationId: string; role: string }[]; onRefresh: () => Promise<boolean> }) {
  const [selectedId, setSelectedId] = useState("");
  const [replacement, setReplacement] = useState<CoordinatorRegistration["participant"] | null>(null);
  const [busy, setBusy] = useState(false); const inFlight = useRef(false);
  const [message, setMessage] = useState(""); const [failed, setFailed] = useState(false);
  const coordinated = new Set(memberships.filter((member) => member.role === "coordinator").map((member) => member.organisationId));
  const rows = registrations.filter((row) => row.registration.organisationId && coordinated.has(row.registration.organisationId));
  const groups = [...new Map(rows.map((row) => [row.registration.id, row])).values()];
  const selected = groups.find((row) => row.registration.id === selectedId) || groups[0];
  const currentRows = rows.filter((row) => row.registration.id === selected?.registration.id);
  const changesOpen = Boolean(selected?.registration.changesOpen);
  async function refresh() {
    if (inFlight.current) return;
    setFailed(false);
    try { if (!await onRefresh()) throw new Error("The roster could not be refreshed."); setReplacement(null); setMessage("Roster refreshed."); }
    catch { setFailed(true); setMessage("The roster could not be refreshed. Please try again."); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || !changesOpen || inFlight.current) return;
    const form = event.currentTarget, fields = new FormData(form);
    const replacing = form.dataset.action === "replace" ? replacement : null;
    if (form.dataset.action === "replace" && !replacing) return;
    const payload = { ...(replacing ? { action: "replace_participant", participantId: replacing.id, updatedAt: replacing.updatedAt } : { action: "add_participant", registrationId: selected.registration.id }), name: fields.get("name"), email: fields.get("email"), phone: fields.get("phone") };
    inFlight.current = true; setBusy(true); setFailed(false); setMessage("");
    try {
      const response = await fetch("/api/portal", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(result?.error?.message || "The participant change could not be saved.");
      form.reset(); setReplacement(null);
      try { if (!await onRefresh()) throw new Error(); setMessage("Participant submitted for administrator review."); }
      catch { setMessage("Participant saved for review, but the roster could not refresh. Refresh the roster before making another change."); }
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "The participant change could not be saved. Please try again."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="portal-panel coordinator-roster" id="organisation">
    <header><h2>Organisation roster</h2><button type="button" disabled={busy} onClick={refresh}>Refresh roster</button></header>
    {message && <p role={failed ? "alert" : "status"}>{message}</p>}
    {!selected ? <p>No organisation registrations yet.</p> : <>
      <label className="coordinator-roster__selection"><span>Organisation course registration</span><select value={selected.registration.id} disabled={busy} onChange={(event) => { setSelectedId(event.target.value); setReplacement(null); setMessage(""); }}>{groups.map((row) => <option key={row.registration.id} value={row.registration.id}>{row.organisationName} — {row.course.title} ({row.offering.code})</option>)}</select></label>
      <p>New and replacement participants require administrator approval. Adding a participant does not take payment; contact administration about any additional fee.</p>
      {!changesOpen && <p>Participant changes are closed for this registration.</p>}
      <div className="portal-roster">{currentRows.map((row) => <div key={row.participant.id}>
        <span className="portal-avatar" aria-hidden="true">{row.participant.name.slice(0, 1)}</span>
        <div><strong>{row.participant.name}</strong><span>{row.participant.email}</span></div>
        <span className={`course-status course-status--${row.participant.status}`}>{row.participant.status.replaceAll("_", " ")}</span>
        <button className="course-table-action" type="button" aria-label={`Replace ${row.participant.name}`} disabled={busy || !changesOpen || !["pending_review", "approved", "waitlisted"].includes(row.participant.status)} onClick={() => { setReplacement({ ...row.participant }); setMessage(""); }}>Replace</button>
      </div>)}</div>
      {replacement && <form key={replacement.id} className="portal-add-person" data-action="replace" onSubmit={submit}>
        <h3>Replace {replacement.name}</h3><p>The old participant loses this enrolment’s access. The replacement does not inherit attendance or completion.</p>
        <label><span>Replacement full name</span><input name="name" minLength={2} maxLength={120} required disabled={busy} /></label>
        <label><span>Replacement email</span><input name="email" type="email" maxLength={254} required disabled={busy} /></label>
        <label><span>Replacement phone</span><input name="phone" maxLength={40} disabled={busy} /></label>
        <button type="submit" disabled={busy || !changesOpen}>{busy ? "Saving…" : "Submit replacement"}</button><button type="button" disabled={busy} onClick={() => setReplacement(null)}>Cancel</button>
      </form>}
      {changesOpen && <form key={selected.registration.id} className="portal-add-person" data-action="add" onSubmit={submit}>
        <h3>Add participant</h3><label><span>Full name</span><input name="name" minLength={2} maxLength={120} required disabled={busy} /></label>
        <label><span>Email</span><input name="email" type="email" maxLength={254} required disabled={busy} /></label>
        <label><span>Phone</span><input name="phone" maxLength={40} disabled={busy} /></label><button type="submit" disabled={busy}>{busy ? "Saving…" : "Add to roster"}</button>
      </form>}
    </>}
  </section>;
}
