"use client";

import { ArrowRight, CalendarDays, LoaderCircle, MapPin, Plus, Trash2, Users } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { formatMoney } from "@/lib/courses";

type Offering = { id: string; title: string; summary: string; code: string; startsAt: string; endsAt: string; timeZone: string; deliveryMode: "in_person" | "virtual" | "blended"; venue: string | null; feeCents: number; currency: string; capacityMode: "unlimited" | "soft" | "hard"; capacity: number | null; approvedSeats: number; registrationClosesAt: string | null };
type Person = { name: string; email: string; phone: string };

export function CourseRegistration() {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [selected, setSelected] = useState<Offering | null>(null);
  const [participants, setParticipants] = useState<Person[]>([{ name: "", email: "", phone: "" }]);
  const [status, setStatus] = useState({ kind: "loading" as "loading" | "idle" | "submitting" | "success" | "error", message: "Loading available courses…" });

  useEffect(() => { fetch("/api/courses", { cache: "no-store" }).then(async (response) => { const result = await response.json() as { data?: Offering[] }; setOfferings(result.data || []); setStatus({ kind: "idle", message: "" }); }).catch(() => setStatus({ kind: "error", message: "Available courses could not be loaded." })); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setStatus({ kind: "submitting", message: "Submitting your registration…" });
    const response = await fetch("/api/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offeringId: selected.id, applicantName: form.get("applicantName"), applicantEmail: form.get("applicantEmail"), applicantPhone: form.get("applicantPhone"), organisationName: form.get("organisationName"), participants, consent: form.get("consent") === "on" }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setStatus({ kind: "error", message: result.error || "Registration could not be submitted." }); return; }
    setStatus({ kind: "success", message: "Registration received. CH Elevate will review it and email the applicant." });
    setParticipants([{ name: "", email: "", phone: "" }]);
  }

  if (status.kind === "loading") return <p className="course-registration__loading"><LoaderCircle className="spin" aria-hidden="true" /> {status.message}</p>;
  return (
    <section className="course-registration" id="available-courses">
      <div className="ref-container">
        <header className="course-registration__heading"><div><span>Course application</span><h2>Upcoming courses open for registration.</h2></div><p>Apply as an individual or submit a team roster. Your information is sent directly to course administration, and your place is confirmed after review.</p></header>
        {offerings.length === 0 ? <div className="course-registration__empty"><h3>No scheduled courses are open yet.</h3><p>Contact us to discuss private or future cohorts.</p></div> : <div className="course-offering-list">{offerings.map((offering) => {
          const remaining = offering.capacity === null ? null : Math.max(0, offering.capacity - offering.approvedSeats);
          return <article key={offering.id}>
            <div><span>{offering.code}</span><h3>{offering.title}</h3><p>{offering.summary}</p></div>
            <dl><div><dt><CalendarDays aria-hidden="true" /> Date</dt><dd>{new Date(offering.startsAt).toLocaleString("en-JM", { dateStyle: "medium", timeStyle: "short", timeZone: offering.timeZone })}</dd></div><div><dt><MapPin aria-hidden="true" /> Delivery</dt><dd>{offering.deliveryMode.replaceAll("_", " ")}{offering.venue ? ` · ${offering.venue}` : ""}</dd></div><div><dt><Users aria-hidden="true" /> Availability</dt><dd>{remaining === null ? "Open" : remaining > 0 ? `${remaining} seats remaining` : offering.capacityMode === "hard" ? "Waitlist available" : "Approval required"}</dd></div></dl>
            <div className="course-offering-list__action"><strong>{formatMoney(offering.feeCents, offering.currency)}</strong><button className="ref-button" type="button" onClick={() => { setSelected(offering); setStatus({ kind: "idle", message: "" }); }}>Register <ArrowRight aria-hidden="true" /></button></div>
          </article>;
        })}</div>}
      </div>
      {selected && <div className="course-application" role="dialog" aria-modal="true" aria-labelledby="course-application-title"><button className="course-application__backdrop" type="button" aria-label="Close registration" onClick={() => setSelected(null)} /><form onSubmit={submit}><header><div><span>Registration application</span><h2 id="course-application-title">{selected.title}</h2><p>{new Date(selected.startsAt).toLocaleDateString("en-JM", { dateStyle: "long", timeZone: selected.timeZone })}</p></div><button type="button" onClick={() => setSelected(null)} aria-label="Close">×</button></header><div className="course-application__body">
        <fieldset><legend>Primary contact</legend><div className="course-form-grid"><label><span>Name</span><input name="applicantName" required /></label><label><span>Email</span><input name="applicantEmail" type="email" required /></label><label><span>Phone</span><input name="applicantPhone" /></label><label><span>Organisation (optional)</span><input name="organisationName" /></label></div></fieldset>
        <fieldset><legend>Participants</legend>{participants.map((person, index) => <div className="course-participant-row" key={index}><label><span>Name</span><input value={person.name} onChange={(event) => setParticipants(participants.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} required /></label><label><span>Email</span><input type="email" value={person.email} onChange={(event) => setParticipants(participants.map((item, i) => i === index ? { ...item, email: event.target.value } : item))} required /></label><label><span>Phone</span><input value={person.phone} onChange={(event) => setParticipants(participants.map((item, i) => i === index ? { ...item, phone: event.target.value } : item))} /></label>{participants.length > 1 && <button type="button" aria-label={`Remove participant ${index + 1}`} onClick={() => setParticipants(participants.filter((_, i) => i !== index))}><Trash2 aria-hidden="true" /></button>}</div>)}<button className="course-add-person" type="button" onClick={() => setParticipants([...participants, { name: "", email: "", phone: "" }])}><Plus aria-hidden="true" /> Add participant</button></fieldset>
        <label className="course-consent"><input name="consent" type="checkbox" required /> <span>I consent to CH Elevate processing these details for course registration and administration.</span></label>
        {status.message && <p className={`course-form-status course-form-status--${status.kind}`} role="status">{status.message}</p>}
        <button className="ref-button" type="submit" disabled={status.kind === "submitting"}>{status.kind === "submitting" ? <LoaderCircle className="spin" aria-hidden="true" /> : null} Submit registration <ArrowRight aria-hidden="true" /></button>
      </div></form></div>}
    </section>
  );
}
