"use client";

import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { bookingHorizonEnd, buildEventSlots, dateInZone, type BookingEvent } from "@/lib/booking-events";

type Slot = { value: string; label: string; startsAt: string };
export function ConsultationForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const prefix = useId();
  const questionnaire = useRef<HTMLFieldSetElement>(null);
  const calendar = useRef<HTMLElement>(null);
  const [events, setEvents] = useState<BookingEvent[]>([]);
  const [eventId, setEventId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [month, setMonth] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [step, setStep] = useState(1);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotRefresh, setSlotRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading booking events…");
  useEffect(() => {
    if (step === 2) questionnaire.current?.querySelector("input")?.focus();
    else calendar.current?.focus();
  }, [step]);
  useEffect(() => {
    let active = true;
    fetch("/api/bookings/events", { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Booking events could not be loaded.");
      if (!active) return;
      setEvents(result.data);
      const slug = new URL(window.location.href).searchParams.get("event");
      setEventId(result.data.find((event: BookingEvent) => event.data.slug === slug)?.id || result.data[0]?.id || "");
      setMessage(result.data.length ? "" : "No booking events are currently published. Please contact us to arrange a consultation.");
    }).catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!date || !eventId) return;
    let active = true;
    fetch(`/api/bookings/availability?eventId=${encodeURIComponent(eventId)}&date=${date}`, { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Available times could not be loaded.");
      if (active) { setSlots(result.slots); setMessage(result.slots.length ? "" : "No available times on this date. Choose another date."); }
    }).catch((error) => { if (active) { setSlots([]); setMessage(error.message); } }).finally(() => { if (active) setLoadingSlots(false); });
    return () => { active = false; };
  }, [date, eventId, slotRefresh]);
  const selected = events.find((event) => event.id === eventId);
  function selectDate(value: string) { setDate(value); setSlotRefresh((value) => value + 1); setTime(""); setSlots([]); setLoadingSlots(true); setMessage(""); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !time || busy) return;
    const form = new FormData(event.currentTarget);
    const answers = Object.fromEntries(selected.data.questions.map((field) => [field.id, field.type === "checkbox" ? form.get(field.id) === "on" : String(form.get(field.id) || "")]));
    setBusy(true); setMessage("Submitting your booking request…");
    try {
      const response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, date, time, answers, name: form.get("name"), email: form.get("email"), phone: form.get("phone"), company: form.get("company"), consent: form.get("consent") === "on" }) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) { setStep(1); setTime(""); setSlots([]); }
        throw new Error(result.error || "Your booking could not be submitted.");
      }
      router.replace("/book/confirmation");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Your booking could not be submitted. Please try again."); }
    finally { setBusy(false); }
  }
  if (!selected) return <div className="consultation-form"><p role="status">{message}</p></div>;
  const today = dateInZone(new Date(), selected.data.timeZone);
  const monthValue = month || today.slice(0, 7);
  const first = new Date(`${monthValue}-01T12:00:00Z`);
  const totalDays = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const horizon = bookingHorizonEnd(selected.data);
  function changeMonth(offset: number) { const next = new Date(first); next.setUTCMonth(next.getUTCMonth() + offset); setMonth(next.toISOString().slice(0, 7)); }
  return <form className={`consultation-form booking-two-step ${compact ? "consultation-form--compact" : ""}`} onSubmit={submit}>
    <div className="field field--wide"><label htmlFor={`${prefix}-event`}>Choose a booking event</label><select id={`${prefix}-event`} value={eventId} disabled={busy} onChange={(e) => { setEventId(e.target.value); setDate(""); setTime(""); setMonth(""); setSlots([]); setStep(1); setLoadingSlots(false); setMessage(""); }}>{events.map((event) => <option key={event.id} value={event.id}>{event.data.title} · {event.data.durationMinutes} minutes</option>)}</select></div>
    <header className="booking-event-summary field--wide">
      {/* eslint-disable-next-line @next/next/no-img-element -- administrator-supplied agent image, no server proxy */}
      <img src={selected.data.agentPhoto} alt={selected.data.agentName} referrerPolicy="no-referrer" width={80} height={80} />
      <div><p>{selected.data.agentName} · {selected.data.durationMinutes} minutes</p><h2>{selected.data.title}</h2><p>{selected.data.subtitle}</p></div>
      <p className="field--wide">{selected.data.description}</p>
    </header>
    <p className="field--wide booking-step-label">Step {step} of 2 · {step === 1 ? "Choose a date and time" : "Your details"}</p>
    {step === 1 && <section ref={calendar} tabIndex={-1} className="field--wide" aria-label="Choose booking time">
      <div className="booking-calendar-heading"><button type="button" aria-label="Previous month" disabled={monthValue <= today.slice(0, 7)} onClick={() => changeMonth(-1)}><ChevronLeft /></button><h3 aria-live="polite">{new Intl.DateTimeFormat("en-JM", { month: "long", year: "numeric", timeZone: "UTC" }).format(first)}</h3><button type="button" aria-label="Next month" disabled={Boolean(horizon && monthValue >= horizon.slice(0, 7))} onClick={() => changeMonth(1)}><ChevronRight /></button></div>
      <div className="booking-month-grid">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day} aria-hidden="true">{day}</span>)}
        {Array.from({ length: first.getUTCDay() }, (_, i) => <span key={`empty-${i}`} />)}
        {Array.from({ length: totalDays }, (_, i) => { const value = `${monthValue}-${String(i + 1).padStart(2, "0")}`; return <button type="button" key={value} aria-label={value} aria-pressed={date === value} disabled={!buildEventSlots(value, selected.data, []).length} onClick={() => selectDate(value)}>{i + 1}</button>; })}
      </div><p>Times shown in {selected.data.timeZone}.</p>
      <div className="booking-time-slots" aria-label="Available times">{loadingSlots ? <p role="status">Loading available times…</p> : slots.map((slot) => <button type="button" key={slot.value} aria-pressed={time === slot.value} onClick={() => setTime(slot.value)}>{slot.label}</button>)}</div>
      <button type="button" className="button button--accent" disabled={!time || loadingSlots} onClick={() => { setStep(2); setMessage(""); }}>Continue to your details <ArrowRight aria-hidden="true" /></button>
    </section>}
    <fieldset ref={questionnaire} className="booking-questionnaire field--wide" hidden={step !== 2} disabled={step !== 2 || busy} key={eventId}>
      <legend>Your booking details</legend><p>{date} at {time} · {selected.data.timeZone}</p><div className="booking-questionnaire-grid">
        {([ ["name", "Full name", "text", "name"], ["email", "Email", "email", "email"], ["phone", "Phone", "tel", "tel"], ["company", "Company", "text", "organization"] ] as const).map(([name, label, type, autoComplete]) => <div className="field" key={name}><label htmlFor={`${prefix}-${name}`}>{label}</label><input id={`${prefix}-${name}`} name={name} type={type} autoComplete={autoComplete} required={name !== "company"} minLength={name === "phone" ? 7 : name === "name" ? 2 : undefined} maxLength={name === "email" ? 254 : name === "phone" ? 40 : name === "name" ? 120 : 160} /></div>)}
        {selected.data.questions.map((field) => <div className="field field--wide" key={field.id}>
          {field.type !== "checkbox" && <label htmlFor={`${prefix}-${field.id}`}>{field.label}{field.required ? " *" : ""}</label>}
          {field.type === "textarea" ? <textarea id={`${prefix}-${field.id}`} name={field.id} required={field.required} maxLength={3000} /> : field.type === "select" ? <select id={`${prefix}-${field.id}`} name={field.id} required={field.required} defaultValue=""><option value="">Choose an option</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select> : field.type === "checkbox" ? <label className="form-consent"><input type="checkbox" name={field.id} required={field.required} /><span>{field.label}</span></label> : <input id={`${prefix}-${field.id}`} name={field.id} required={field.required} maxLength={3000} />}
        </div>)}
        <label className="form-consent field--wide"><input name="consent" type="checkbox" required /><span>I consent to CH Elevate using this information to manage my appointment.</span></label>
      </div><div className="booking-event-actions"><button type="button" onClick={() => setStep(1)}><ArrowLeft aria-hidden="true" /> Back</button><button type="submit" className="button button--accent">{busy ? "Submitting…" : "Request booking"} <ArrowRight aria-hidden="true" /></button></div>
    </fieldset>
    <p className="form-note field--wide" role="status" aria-live="polite">{message || "Your request is subject to administrator confirmation."}</p>
  </form>;
}
