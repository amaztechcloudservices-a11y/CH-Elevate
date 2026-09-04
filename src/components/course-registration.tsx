"use client";

import { ArrowRight, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

import { defaultCourseCatalogueSection, type CourseCatalogueSectionInput } from "@/lib/course-catalogue";
import { CoursePublicCatalogue, type CourseCatalogueCard, type CourseOffering } from "./course-public-catalogue";

type Offering = CourseOffering;
type Person = { name: string; email: string; phone: string };

export function CourseRegistration({ pageSlug }: { pageSlug: CourseCatalogueSectionInput["pageSlug"] }) {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [catalogue, setCatalogue] = useState<{ data: CourseCatalogueCard[]; section: CourseCatalogueSectionInput } | null>(null);
  const [catalogueError, setCatalogueError] = useState("");
  const [selected, setSelected] = useState<Offering | null>(null);
  const [participants, setParticipants] = useState<Person[]>([{ name: "", email: "", phone: "" }]);
  const [status, setStatus] = useState({ kind: "loading" as "loading" | "idle" | "submitting" | "success" | "error", message: "Loading available courses…" });
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current!; dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, [selected]);

  useEffect(() => { fetch("/api/courses", { cache: "no-store" }).then(async (response) => { const result = await response.json() as { data?: Offering[] }; if (!response.ok) throw new Error("Unavailable"); setOfferings(result.data || []); setStatus({ kind: "idle", message: "" }); }).catch(() => setStatus({ kind: "error", message: "Available dates could not be loaded. Reload the page to try again." })); }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/course-catalogue", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const result = await response.json() as { data?: CourseCatalogueCard[]; section?: CourseCatalogueSectionInput };
      if (!response.ok) throw new Error("The course catalogue could not be loaded.");
      setCatalogue({ data: result.data || [], section: result.section || defaultCourseCatalogueSection }); setCatalogueError("");
    }).catch((cause) => { if (!controller.signal.aborted) setCatalogueError(cause instanceof Error ? cause.message : "The course catalogue could not be loaded."); });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || status.kind === "submitting" || status.kind === "success") return;
    const form = new FormData(event.currentTarget);
    setStatus({ kind: "submitting", message: "Submitting your registration…" });
    try {
    const response = await fetch("/api/courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offeringId: selected.id, applicantName: form.get("applicantName"), applicantEmail: form.get("applicantEmail"), applicantPhone: form.get("applicantPhone"), organisationName: form.get("organisationName"), participants, consent: form.get("consent") === "on" }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setStatus({ kind: "error", message: result.error || "Registration could not be submitted." }); return; }
    setStatus({ kind: "success", message: "Registration received. CH Elevate will review it and email the applicant." });
    setParticipants([{ name: "", email: "", phone: "" }]);
    } catch { setStatus({ kind: "error", message: "Registration could not be submitted. Please try again." }); }
  }

  if (catalogueError) return pageSlug === "programmes" ? <p className="course-registration__loading" role="alert">{catalogueError}</p> : null;
  if (!catalogue || !catalogue.section.isPublished || catalogue.section.pageSlug !== pageSlug) return null;
  const sectionStyle = catalogue.section.backgroundType === "image"
    ? { backgroundColor: catalogue.section.backgroundColor, backgroundImage: `url(${JSON.stringify(catalogue.section.backgroundImageUrl)})` }
    : { backgroundColor: catalogue.section.backgroundColor };
  const color = catalogue.section.backgroundColor.slice(1);
  const darkBackground = [0, 2, 4].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16)).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0) < 145;
  return (
    <section className="course-registration" id="available-courses" aria-label="Published course catalogue" data-background={catalogue.section.backgroundType} data-tone={darkBackground ? "dark" : "light"} style={sectionStyle}>
      <div className="ref-container">
        <header className="course-registration__heading"><div><span>Course application</span><h2>Upcoming courses open for registration.</h2></div><p>Apply as an individual or submit a team roster. Your information is sent directly to course administration, and your place is confirmed after review.</p></header>
        {status.kind === "loading" && <p className="course-registration__dates" role="status"><LoaderCircle className="spin" aria-hidden="true" /> {status.message}</p>}
        {!selected && status.kind === "error" && <p role="alert">{status.message}</p>}
        <CoursePublicCatalogue cards={catalogue.data} offerings={offerings} onRegister={(offering) => { setSelected(offering); setParticipants([{ name: "", email: "", phone: "" }]); setStatus({ kind: "idle", message: "" }); }} />
      </div>
      {selected && <dialog ref={dialogRef} className="course-application course-application--native" aria-labelledby="course-application-title" onCancel={(event) => { if (status.kind === "submitting") event.preventDefault(); else setSelected(null); }}><form onSubmit={submit}><header><div><span>Registration application</span><h2 id="course-application-title">{selected.title}</h2><p>{new Date(selected.startsAt).toLocaleDateString("en-JM", { dateStyle: "long", timeZone: selected.timeZone })}</p></div><button type="button" onClick={() => setSelected(null)} disabled={status.kind === "submitting"} aria-label="Close registration">×</button></header><div className="course-application__body">
        <fieldset disabled={status.kind === "submitting" || status.kind === "success"}><legend>Primary contact</legend><div className="course-form-grid"><label><span>Name</span><input name="applicantName" required /></label><label><span>Email</span><input name="applicantEmail" type="email" required /></label><label><span>Phone</span><input name="applicantPhone" /></label><label><span>Organisation (optional)</span><input name="organisationName" /></label></div></fieldset>
        <fieldset disabled={status.kind === "submitting" || status.kind === "success"}><legend>Participants</legend>{participants.map((person, index) => <div className="course-participant-row" key={index}><label><span>Name</span><input value={person.name} onChange={(event) => setParticipants(participants.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} required /></label><label><span>Email</span><input type="email" value={person.email} onChange={(event) => setParticipants(participants.map((item, i) => i === index ? { ...item, email: event.target.value } : item))} required /></label><label><span>Phone</span><input value={person.phone} onChange={(event) => setParticipants(participants.map((item, i) => i === index ? { ...item, phone: event.target.value } : item))} /></label>{participants.length > 1 && <button type="button" aria-label={`Remove participant ${index + 1}`} onClick={() => setParticipants(participants.filter((_, i) => i !== index))}><Trash2 aria-hidden="true" /></button>}</div>)}<button className="course-add-person" type="button" onClick={() => setParticipants([...participants, { name: "", email: "", phone: "" }])}><Plus aria-hidden="true" /> Add participant</button></fieldset>
        <label className="course-consent"><input name="consent" type="checkbox" required /> <span>I consent to CH Elevate processing these details for course registration and administration.</span></label>
        {status.message && <p className={`course-form-status course-form-status--${status.kind}`} role="status">{status.message}</p>}
        <button className="ref-button" type="submit" disabled={status.kind === "submitting" || status.kind === "success"}>{status.kind === "submitting" ? <LoaderCircle className="spin" aria-hidden="true" /> : null} Submit registration <ArrowRight aria-hidden="true" /></button>
      </div></form></dialog>}
    </section>
  );
}
