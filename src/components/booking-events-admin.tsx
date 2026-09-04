"use client";

import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { bookingEventSchema, newBookingEvent, type BookingEvent, type BookingEventDefinition } from "@/lib/booking-events";
import { LocalImageUpload } from "./local-image-upload";

const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function BookingEventsAdmin() {
  const [events, setEvents] = useState<BookingEvent[]>([]);
  const [editing, setEditing] = useState<BookingEvent | "new" | null>(null);
  const [draft, setDraft] = useState<BookingEventDefinition>(structuredClone(newBookingEvent));
  const [message, setMessage] = useState("Loading booking events…");
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [deleteId, setDeleteId] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/admin/booking-events", { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Events could not be loaded.");
      if (active) { setEvents(result.data); setMessage(""); }
    }).catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, []);
  function edit(event: BookingEvent | "new") {
    setEditing(event); setDraft(structuredClone(event === "new" ? newBookingEvent : event.data)); setMessage(""); setDeleteId("");
  }
  async function mutate(body: object, action: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/booking-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "The event could not be saved.");
      setEvents((current) => action === "delete" ? current.filter((item) => item.id !== result.data.id) : [result.data, ...current.filter((item) => item.id !== result.data.id)]);
      setEditing(null); setDeleteId(""); setMessage(action === "delete" ? "Event deleted." : action === "duplicate" ? "Draft copy created." : "Event saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The operation failed."); }
    finally { setBusy(false); }
  }
  function save(event: FormEvent) {
    event.preventDefault();
    if (imageBusy) return;
    const parsed = bookingEventSchema.safeParse(draft);
    if (!parsed.success) { setMessage(parsed.error.issues[0].message); return; }
    void mutate(editing === "new" ? { action: "create", data: parsed.data } : { action: "update", id: editing?.id, updatedAt: editing?.updatedAt, data: parsed.data }, "save");
  }
  const update = <K extends keyof BookingEventDefinition>(key: K, value: BookingEventDefinition[K]) => setDraft({ ...draft, [key]: value });
  return <div className="booking-events-admin">
    <header className="cms-panel-heading"><span>Booking operations</span><h1>Booking events.</h1><p>Create the conversations clients can book. Each event owns its schedule, duration, assigned agent and questionnaire.</p></header>
    <p role="status">{message}</p>
    {!editing && <>
      <button type="button" className="button button--accent" onClick={() => edit("new")}><Plus aria-hidden="true" /> Add booking event</button>
      <div className="booking-event-cards">{events.map((event) => <article className="cms-card" key={event.id}>
        <p className="ref-kicker">{event.data.isPublished ? "Published" : "Draft"} · {event.data.durationMinutes} minutes</p>
        <h2>{event.data.title}</h2><p>{event.data.subtitle}</p><p>{event.data.description}</p>
        <p>{event.data.agentName || "Agent not assigned"} · {event.data.timeZone}</p>
        {event.data.isPublished && <a href={`/book?event=${encodeURIComponent(event.data.slug)}`} target="_blank" rel="noreferrer">View public booking</a>}
        <div className="booking-event-actions">
          <button type="button" disabled={busy} onClick={() => edit(event)}><Pencil aria-hidden="true" /> Edit</button>
          <button type="button" disabled={busy} onClick={() => mutate({ action: "duplicate", id: event.id }, "duplicate")}><Copy aria-hidden="true" /> Duplicate</button>
          <button type="button" disabled={busy} onClick={() => setDeleteId(event.id)}><Trash2 aria-hidden="true" /> Delete</button>
        </div>
        {deleteId === event.id && <div role="group" aria-label={`Confirm deletion of ${event.data.title}`}><p>Delete this event? Events with booking history must be unpublished instead.</p><button disabled={busy} onClick={() => mutate({ action: "delete", id: event.id }, "delete")}>Confirm delete</button><button onClick={() => setDeleteId("")}>Keep event</button></div>}
      </article>)}</div>
      {!events.length && !message && <p className="cms-empty">No booking events yet. Create a draft, assign an agent and publish it when ready.</p>}
    </>}
    {editing && <form className="cms-card course-admin-form booking-event-editor" onSubmit={save}>
      <h2>{editing === "new" ? "New booking event" : "Edit booking event"}</h2>
      <fieldset disabled={busy || imageBusy}><legend>Event details</legend><div className="course-form-grid">
        <label><span>Event title</span><input value={draft.title} onChange={(e) => update("title", e.target.value)} required maxLength={160} /></label>
        <label><span>Event URL slug</span><input value={draft.slug} onChange={(e) => update("slug", e.target.value)} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={160} /></label>
        <label><span>Subtitle</span><input value={draft.subtitle} onChange={(e) => update("subtitle", e.target.value)} maxLength={240} /></label>
        <label><span>Session duration</span><select value={draft.durationMinutes} onChange={(e) => update("durationMinutes", Number(e.target.value) as BookingEventDefinition["durationMinutes"])}>{[30, 45, 60, 90].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label>
        <label><span>Agent name</span><input value={draft.agentName} onChange={(e) => update("agentName", e.target.value)} maxLength={120} /></label>
        <LocalImageUpload label="Agent photo" value={draft.agentPhoto} onUploaded={(agentPhoto) => update("agentPhoto", agentPhoto)} disabled={busy} required={draft.isPublished} onBusyChange={setImageBusy} />
      </div><label><span>Description</span><textarea value={draft.description} onChange={(e) => update("description", e.target.value)} required minLength={10} maxLength={4000} /></label>
      <label className="booking-event-check"><input type="checkbox" checked={draft.isPublished} onChange={(e) => update("isPublished", e.target.checked)} /><span>Publish on the booking page</span></label></fieldset>
      <fieldset disabled={busy || imageBusy}><legend>Availability</legend><div className="course-form-grid">
        <label><span>Time zone</span><input value={draft.timeZone} onChange={(e) => update("timeZone", e.target.value)} required /></label>
        <label><span>Minimum advance notice (hours)</span><input type="number" min={0} max={720} value={draft.leadTimeHours} onChange={(e) => update("leadTimeHours", Number(e.target.value))} required /></label>
        <label><span>Book ahead for</span><input type="number" min={1} max={1000} value={draft.horizon.count} disabled={draft.horizon.unit === "infinite"} onChange={(e) => update("horizon", { ...draft.horizon, count: Number(e.target.value) })} required /></label>
        <label><span>Availability horizon unit</span><select value={draft.horizon.unit} onChange={(e) => update("horizon", { count: e.target.value === "infinite" ? 1 : draft.horizon.count, unit: e.target.value as BookingEventDefinition["horizon"]["unit"] })}>{["days", "weeks", "months", "years", "infinite"].map((unit) => <option key={unit}>{unit}</option>)}</select></label>
      </div><p>Booking opens through the final date, counted from today in this event’s time zone. Months and years keep the same day where possible, otherwise use the target month’s last day. Infinite removes the end date; weekly hours, closures, advance notice and occupied slots still apply.</p>
      <p>All events share the consultation calendar: occupied times are unavailable across events.</p>
      {draft.weekly.map((day, index) => <div className="booking-event-day" key={day.day}>
        <label className="booking-event-check"><input type="checkbox" checked={day.enabled} onChange={(e) => update("weekly", draft.weekly.map((item, i) => i === index ? { ...item, enabled: e.target.checked } : item))} /><span>{days[day.day]}</span></label>
        {day.enabled && <><div className="booking-event-windows">{day.windows.map((window, windowIndex) => <div className="booking-event-actions" key={windowIndex}>
          {(["start", "end"] as const).map((key) => <label key={key}><span>{days[day.day]} {key} {windowIndex + 1}</span><input type="time" required value={window[key]} onChange={(e) => update("weekly", draft.weekly.map((item, i) => i === index ? { ...item, windows: item.windows.map((w, wi) => wi === windowIndex ? { ...w, [key]: e.target.value } : w) } : item))} /></label>)}
          <button type="button" onClick={() => update("weekly", draft.weekly.map((item, i) => i === index ? { ...item, windows: item.windows.filter((_, wi) => wi !== windowIndex) } : item))}>Remove hours</button>
        </div>)}</div><button type="button" disabled={day.windows.length >= 8} onClick={() => update("weekly", draft.weekly.map((item, i) => i === index ? { ...item, windows: [...item.windows, { start: "09:00", end: "17:00" }] } : item))}>Add hours for {days[day.day]}</button></>}
      </div>)}
      <h3>Date exceptions</h3><p>Override weekly hours for a date, or mark it closed.</p>
      {draft.dateOverrides.map((day, index) => <div className="booking-event-actions" key={index}>
        <label><span>Exception date {index + 1}</span><input type="date" required value={day.date} onChange={(e) => update("dateOverrides", draft.dateOverrides.map((item, i) => i === index ? { ...item, date: e.target.value } : item))} /></label>
        <label className="booking-event-check"><input type="checkbox" checked={!day.windows.length} onChange={(e) => update("dateOverrides", draft.dateOverrides.map((item, i) => i === index ? { ...item, windows: e.target.checked ? [] : [{ start: "09:00", end: "17:00" }] } : item))} /><span>Closed</span></label>
        {day.windows.map((window, wi) => (["start", "end"] as const).map((key) => <label key={`${wi}-${key}`}><span>Exception {index + 1} {key}</span><input type="time" required value={window[key]} onChange={(e) => update("dateOverrides", draft.dateOverrides.map((item, i) => i === index ? { ...item, windows: item.windows.map((w, j) => j === wi ? { ...w, [key]: e.target.value } : w) } : item))} /></label>))}
        <button type="button" onClick={() => update("dateOverrides", draft.dateOverrides.filter((_, i) => i !== index))}>Remove exception</button>
      </div>)}<button type="button" onClick={() => update("dateOverrides", [...draft.dateOverrides, { date: "", windows: [] }])}>Add date exception</button></fieldset>
      <fieldset disabled={busy || imageBusy}><legend>Custom questionnaire</legend><p>Name, email, phone and consent are always collected. Add event-specific questions below.</p>
      {draft.questions.map((question, index) => <div className="booking-event-question" key={question.id}>
        <label><span>Question {index + 1}</span><input required value={question.label} onChange={(e) => update("questions", draft.questions.map((item, i) => i === index ? { ...item, label: e.target.value } : item))} /></label>
        <label><span>Question {index + 1} type</span><select value={question.type} onChange={(e) => update("questions", draft.questions.map((item, i) => i === index ? { ...item, type: e.target.value as typeof question.type } : item))}>{["text", "textarea", "select", "checkbox"].map((type) => <option key={type}>{type}</option>)}</select></label>
        {question.type === "select" && <label><span>Choices (one per line)</span><textarea value={question.options.join("\n")} onChange={(e) => update("questions", draft.questions.map((item, i) => i === index ? { ...item, options: e.target.value.split("\n") } : item))} /></label>}
        <label className="booking-event-check"><input type="checkbox" checked={question.required} onChange={(e) => update("questions", draft.questions.map((item, i) => i === index ? { ...item, required: e.target.checked } : item))} /><span>Required</span></label>
        <button type="button" onClick={() => update("questions", draft.questions.filter((_, i) => i !== index))}>Remove question {index + 1}</button>
      </div>)}<button type="button" disabled={draft.questions.length >= 30} onClick={() => update("questions", [...draft.questions, { id: `question_${crypto.randomUUID().replaceAll("-", "")}`, label: "", type: "text", required: false, options: [] }])}>Add question</button></fieldset>
      <div className="booking-event-actions"><button type="submit" disabled={busy || imageBusy}>{busy ? "Saving…" : imageBusy ? "Uploading image…" : "Save event"}</button><button type="button" disabled={busy || imageBusy} onClick={() => setEditing(null)}>Cancel editing</button></div>
    </form>}
  </div>;
}
