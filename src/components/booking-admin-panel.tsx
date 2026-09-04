"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { bookingStatuses, bookingStatusLabels, questionnaireEntries, type AdminBooking } from "@/lib/admin-bookings";
import { dateInZone, type BookingEvent } from "@/lib/booking-events";

type CalendarData = {
  bookings: AdminBooking[]; events: BookingEvent[]; timeZone: string; today: string;
  blocks: { id: string; startsAt: string; endsAt: string; reason: string | null }[];
  days: { date: string; slots: { value: string; label: string; startsAt: string }[] }[];
};
type Listing = { data: AdminBooking[]; total: number; pageSize: number };
type BookingAction = (input: Record<string, unknown>) => Promise<boolean>;
const monthLabel = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" });
const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const timeLabel = (value: string, timeZone: string) => new Date(value).toLocaleTimeString("en-JM", { hour: "numeric", minute: "2-digit", timeZone });
async function readResponse(response: Response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "The request could not be completed.");
  return result;
}

export function BookingAdminPanel() {
  const [view, setView] = useState<"calendar" | "requests" | "deleted">("calendar");
  const [month, setMonth] = useState(() => dateInZone(new Date(), "America/Jamaica").slice(0, 7));
  const [date, setDate] = useState(() => dateInZone(new Date(), "America/Jamaica"));
  const [eventId, setEventId] = useState("");
  const [calendar, setCalendar] = useState<CalendarData | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<AdminBooking | null>(null);
  const requestKey = JSON.stringify([view, month, eventId, page, filter, query, revision]);
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    const url = view === "calendar"
      ? `/api/admin/bookings/calendar?${new URLSearchParams({ month, ...(eventId ? { eventId } : {}) })}`
      : `/api/admin/bookings?${new URLSearchParams({ page: String(page), status: filter, search: query, deleted: String(view === "deleted") })}`;
    fetch(url, { cache: "no-store", signal: controller.signal }).then(readResponse).then((result) => {
      if (controller.signal.aborted) return;
      setLoadError("");
      if (view === "calendar") setCalendar(result.data); else setListing(result);
    }).catch((error) => {
      if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "Bookings could not be loaded.");
    }).finally(() => { if (!controller.signal.aborted) setLoadedKey(requestKey); });
    return () => controller.abort();
  }, [view, month, eventId, page, filter, query, requestKey]);

  async function mutate(input: Record<string, unknown>) {
    if (!selected || busy) return false;
    setBusy(true); setMessage("");
    try {
      const result = await readResponse(await fetch("/api/admin/bookings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id, updatedAt: selected.updatedAt, ...input }) }));
      setSelected(input.action === "delete" || input.action === "restore" ? null : result.data);
      setRevision((value) => value + 1);
      const notifications: { state: string }[] = result.notifications || [];
      const mailResult = notifications.length ? ` ${notifications.filter((item) => item.state === "accepted").length}/${notifications.length} emails accepted by the mail server. Check Email notifications for delivery details or retries.` : " No customer email was requested.";
      setMessage(input.action === "delete" ? "Booking moved to Deleted bookings. It can be restored there." : `Booking saved.${mailResult}`);
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Booking could not be saved."); return false; }
    finally { setBusy(false); }
  }
  function changeMonth(offset: number) {
    const next = new Date(`${month}-01T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + offset);
    if (next.getUTCFullYear() < 2000 || next.getUTCFullYear() > 9998) return;
    const value = next.toISOString().slice(0, 7); setMonth(value); setDate(`${value}-01`);
  }
  const event = calendar?.events.find((item) => item.id === eventId);
  const bookingsByDate = useMemo(() => {
    const grouped = new Map<string, AdminBooking[]>();
    if (!calendar) return grouped;
    for (const row of calendar.bookings) {
      const start = dateInZone(new Date(row.startsAt), calendar.timeZone);
      const end = dateInZone(new Date(new Date(row.endsAt).getTime() - 1), calendar.timeZone);
      for (const day of calendar.days) {
        if (day.date >= start && day.date <= end) grouped.set(day.date, [...(grouped.get(day.date) || []), row]);
      }
    }
    return grouped;
  }, [calendar]);
  const daysBookings = bookingsByDate.get(date) || [];

  return <div className="booking-admin">
    <header className="cms-panel-heading"><span>Appointment management</span><h1>Bookings.</h1><p>Review requests and questionnaires, manage the calendar, and approve or reject appointments.</p></header>
    <div className="booking-event-actions" aria-label="Booking views">
      {(["calendar", "requests", "deleted"] as const).map((item) => <button key={item} type="button" aria-pressed={view === item} onClick={() => { setView(item); setPage(1); setSelected(null); setMessage(""); }}>{item === "calendar" ? "Calendar" : item === "requests" ? "All requests" : "Deleted bookings"}</button>)}
      <button type="button" onClick={() => { setSelected(null); setRevision((value) => value + 1); }} disabled={loading || busy}>Refresh</button>
    </div>
    {!selected && message && <p role="status">{message}</p>}
    {!loading && loadError && <p role="alert">{loadError} Use Refresh to try again.</p>}
    {view === "calendar" && <section className="cms-card booking-calendar" aria-label="Booking calendar" aria-busy={loading}>
      <div className="booking-calendar-toolbar">
        <div className="booking-event-actions"><button type="button" aria-label="Previous month" onClick={() => changeMonth(-1)} disabled={loading}><ChevronLeft aria-hidden="true" /></button><h2>{monthLabel(month)}</h2><button type="button" aria-label="Next month" onClick={() => changeMonth(1)} disabled={loading}><ChevronRight aria-hidden="true" /></button></div>
        <label>Jump to month<input type="month" value={month} min="2000-01" max="9998-12" onChange={(e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { setMonth(e.target.value); setDate(`${e.target.value}-01`); } }} /></label>
        <label>Availability for event<select value={eventId} onChange={(e) => setEventId(e.target.value)}><option value="">All bookings · choose an event for slots</option>{calendar?.events.map((item) => <option key={item.id} value={item.id}>{item.data.title}{!item.data.isPublished ? " (draft)" : ""}</option>)}</select></label>
      </div>
      <p>Time zone: {calendar?.timeZone || "America/Jamaica"}. All events share one consultation calendar. Selecting an event shows its available times; bookings from every event remain visible.</p>
      {loading ? <p role="status">Loading calendar…</p> : !loadError && calendar && <>
        <div className="booking-calendar-grid" aria-label={monthLabel(month)}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span className="booking-weekday" key={day}>{day}</span>)}
          {Array.from({ length: new Date(`${month}-01T12:00:00Z`).getUTCDay() }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
          {calendar.days.map((day) => {
            const rows = bookingsByDate.get(day.date) || [];
            return <button type="button" key={day.date} className="booking-calendar-day" aria-pressed={date === day.date} aria-current={day.date === calendar.today ? "date" : undefined} aria-label={`${dateLabel(day.date)}, ${rows.length} bookings${event ? `, ${day.slots.length} available times` : ""}`} onClick={() => setDate(day.date)}>
              <strong>{Number(day.date.slice(-2))}</strong><span className="booking-day-count">{rows.length ? `${rows.length} req.` : ""}</span>
              <span className="booking-day-preview">{rows.slice(0, 2).map((row) => <span key={row.id}>{timeLabel(row.startsAt, calendar.timeZone)} · {row.customerName}</span>)}</span>
              {event && <span className="booking-day-slots">{day.slots.length} free</span>}
            </button>;
          })}
        </div>
        <div className="booking-calendar-detail"><h2>{dateLabel(date)}</h2>
          <BookingRows rows={daysBookings} onSelect={(row) => { setSelected(row); setMessage(""); }} />
          {calendar.blocks.filter((block) => dateInZone(new Date(block.startsAt), calendar.timeZone) <= date && dateInZone(new Date(new Date(block.endsAt).getTime() - 1), calendar.timeZone) >= date).map((block) => <p key={block.id}>Calendar block: {timeLabel(block.startsAt, calendar.timeZone)}–{timeLabel(block.endsAt, calendar.timeZone)} · {block.reason || "Unavailable"}</p>)}
          {event && <><h3>Available times · {event.data.title}</h3>{!event.data.isPublished && <p>This is a draft preview. Clients cannot book it until it is published.</p>}<div className="booking-available-times">{calendar.days.find((day) => day.date === date)?.slots.map((slot) => <span key={slot.value}>{slot.label}</span>)}</div>{!calendar.days.find((day) => day.date === date)?.slots.length && <p>No available times. Event hours, advance notice, horizon, existing bookings and blocks are included.</p>}
            <DayAvailability key={`${event.updatedAt}-${date}`} event={event} date={date} onSaved={() => setRevision((value) => value + 1)} />
          </>}
        </div>
      </>}
    </section>}
    {view !== "calendar" && <section className="cms-card" aria-label={view === "deleted" ? "Deleted bookings" : "All booking requests"} aria-busy={loading}>
      <form className="booking-event-actions" onSubmit={(e) => { e.preventDefault(); setPage(1); setQuery(search); }}><label>Search bookings<input value={search} onChange={(e) => setSearch(e.target.value)} maxLength={120} placeholder="Client, email or event" /></label><button type="submit">Search</button><label>Filter status<select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>{["all", ...bookingStatuses].map((status) => <option key={status} value={status}>{status === "all" ? "All statuses" : bookingStatusLabels[status as keyof typeof bookingStatusLabels]}</option>)}</select></label></form>
      {loading ? <p role="status">Loading bookings…</p> : !loadError && listing && <><p>{listing.total} {view === "deleted" ? "deleted bookings" : "requests"}</p><BookingRows rows={listing.data} onSelect={(row) => { setSelected(row); setMessage(""); }} /><div className="booking-event-actions"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous page</button><span>Page {page} of {Math.max(1, Math.ceil(listing.total / listing.pageSize))}</span><button disabled={page * listing.pageSize >= listing.total} onClick={() => setPage((value) => value + 1)}>Next page</button></div></>}
    </section>}
    {selected && <BookingDialog key={selected.id} booking={selected} busy={busy} message={message} mutate={mutate} onClose={() => { if (!busy) setSelected(null); }} />}
  </div>;
}

function BookingRows({ rows, onSelect }: { rows: AdminBooking[]; onSelect: (row: AdminBooking) => void }) {
  return <div className="booking-request-list">{rows.map((row) => <article key={row.id}>
    <div><h3>{row.customerName}</h3><p>{row.service}</p><p>{row.customerEmail}</p></div>
    <div><span className="booking-status" data-status={row.status}>{bookingStatusLabels[row.status]}</span><p>{new Date(row.startsAt).toLocaleString("en-JM", { dateStyle: "medium", timeStyle: "short", timeZone: row.timeZone })}<br />{row.timeZone}</p></div>
    <button type="button" onClick={() => onSelect(row)} aria-label={`Manage booking for ${row.customerName}`}>{row.deletedAt ? "Review / restore" : "Manage"}</button>
  </article>)}{!rows.length && <p>No bookings to display.</p>}</div>;
}

function BookingDialog({ booking, busy, message, mutate: sendMutation, onClose }: { booking: AdminBooking; busy: boolean; message: string; mutate: BookingAction; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"review" | "edit" | "reschedule" | "duplicate">("review");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const mutate: BookingAction = (input) => sendMutation({ ...input, notifyCustomer: ["status", "reschedule", "duplicate"].includes(String(input.action)) && notifyCustomer });
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  return <dialog ref={dialog} className="booking-dialog" aria-labelledby="booking-dialog-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
    <div className="booking-dialog-header"><h2 id="booking-dialog-title">{booking.customerName}</h2><button type="button" aria-label="Close booking" disabled={busy} onClick={onClose}><X aria-hidden="true" /></button></div>
    <p>{booking.service} · {bookingStatusLabels[booking.status]}{booking.deletedAt ? " · Deleted" : ""}</p>
    <p>{new Date(booking.startsAt).toLocaleString("en-JM", { dateStyle: "full", timeStyle: "short", timeZone: booking.timeZone })} · {Math.round((new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime()) / 60_000)} minutes<br />{booking.timeZone}</p>
    {message && <p role="status">{message}</p>}
    <fieldset disabled={busy}>
      {!booking.deletedAt && <label className="booking-mail-check"><input type="checkbox" checked={notifyCustomer} onChange={(event) => setNotifyCustomer(event.target.checked)} />Email customer about status or time changes</label>}
      {booking.deletedAt ? <><p>Restoring retains the previous status. If its time is occupied, restore will be refused until the conflict is resolved.</p><button type="button" onClick={() => mutate({ action: "restore" })}>Restore booking</button></> : <>
        <div className="booking-event-actions">{(["review", "edit", "reschedule", "duplicate"] as const).map((value) => <button type="button" aria-pressed={mode === value} key={value} onClick={() => { setMode(value); setConfirmDelete(false); }}>{value === "review" ? "Details" : value === "edit" ? "Edit details" : value === "reschedule" ? "Reschedule" : "Duplicate"}</button>)}</div>
        {mode === "edit" && <form className="cms-form-grid" key={`edit-${booking.updatedAt}`} onSubmit={async (e) => { e.preventDefault(); const fields = Object.fromEntries(new FormData(e.currentTarget)); if (await mutate({ action: "edit", ...fields })) setMode("review"); }}>
          <label>Client name<input name="customerName" defaultValue={booking.customerName} minLength={2} maxLength={120} required /></label><label>Email<input name="customerEmail" type="email" defaultValue={booking.customerEmail} maxLength={254} required /></label><label>Phone<input name="customerPhone" defaultValue={booking.customerPhone || ""} maxLength={40} /></label><label>Company<input name="company" defaultValue={booking.company || ""} maxLength={160} /></label><label className="wide">Admin notes<textarea name="notes" defaultValue={booking.notes || ""} maxLength={4000} /></label><button type="submit">Save details</button>
        </form>}
        {(mode === "reschedule" || mode === "duplicate") && <form className="cms-form-grid" key={mode} onSubmit={async (e) => { e.preventDefault(); const fields = Object.fromEntries(new FormData(e.currentTarget)); if (await mutate({ action: mode, ...fields, durationMinutes: Number(fields.durationMinutes) })) setMode("review"); }}>
          <p className="wide">Times use {booking.timeZone}. This is an administrator override of public event hours and notice rules, but occupied times and calendar blocks cannot be overridden. The saved booking will be pending.</p>
          <label>Date<input type="date" name="date" required min={dateInZone(new Date(), booking.timeZone)} defaultValue={mode === "reschedule" ? dateInZone(new Date(booking.startsAt), booking.timeZone) : ""} /></label><label>Time<input type="time" name="time" required /></label><label>Duration<select name="durationMinutes" defaultValue={String([30, 45, 60, 90].includes((new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime()) / 60000) ? (new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime()) / 60000 : 30)}>{[30, 45, 60, 90].map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></label><button type="submit">{mode === "duplicate" ? "Create duplicate booking" : "Save new time"}</button>
        </form>}
      </>}
      {mode === "review" && <><dl className="booking-answers"><dt>Email</dt><dd>{booking.customerEmail}</dd><dt>Phone</dt><dd>{booking.customerPhone || "Not provided"}</dd><dt>Company</dt><dd>{booking.company || "Not provided"}</dd><dt>Admin notes</dt><dd>{booking.notes || "None"}</dd>{questionnaireEntries(booking.questionnaire).map((entry, index) => <div key={index}><dt>{entry.label}</dt><dd>{entry.value || "Not provided"}</dd></div>)}</dl>
        {!booking.deletedAt && <><div className="booking-event-actions"><button type="button" disabled={booking.status === "confirmed"} onClick={() => mutate({ action: "status", status: "confirmed" })}>Approve request</button><button type="button" disabled={booking.status === "rejected"} onClick={() => mutate({ action: "status", status: "rejected" })}>Reject request</button></div><label>Booking status<select value={booking.status} onChange={(e) => mutate({ action: "status", status: e.target.value })}>{bookingStatuses.map((status) => <option key={status} value={status}>{bookingStatusLabels[status]}</option>)}</select></label></>}
      </>}
      {!booking.deletedAt && <div className="booking-delete"><p>Enabled templates control customer emails. Editing contact details or notes, deleting, and restoring do not send emails. Use Cancelled status first if the customer needs a cancellation message.</p><div className="booking-event-actions"><button type="button" onClick={() => sendMutation({ action: "status", status: booking.status, notifyCustomer: true })}>Email current status</button></div>{confirmDelete ? <><p>Move this booking to Deleted bookings and release its reserved time? The record and answers will be retained for restoration.</p><div className="booking-event-actions"><button type="button" onClick={() => mutate({ action: "delete" })}>Confirm move to Deleted bookings</button><button type="button" onClick={() => setConfirmDelete(false)}>Keep booking</button></div></> : <button type="button" onClick={() => setConfirmDelete(true)}>Delete booking</button>}</div>}
    </fieldset>
  </dialog>;
}

function DayAvailability({ event, date, onSaved }: { event: BookingEvent; date: string; onSaved: () => void }) {
  const override = event.data.dateOverrides.find((item) => item.date === date);
  const weekday = event.data.weekly.find((item) => item.day === new Date(`${date}T12:00:00Z`).getUTCDay());
  const [windows, setWindows] = useState(override ? override.windows : weekday?.enabled ? weekday.windows : []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(reset = false) {
    setBusy(true); setMessage("");
    const dateOverrides = event.data.dateOverrides.filter((item) => item.date !== date);
    if (!reset) dateOverrides.push({ date, windows });
    try {
      await readResponse(await fetch("/api/admin/booking-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", id: event.id, updatedAt: event.updatedAt, data: { ...event.data, dateOverrides } }) }));
      onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Availability could not be saved."); }
    finally { setBusy(false); }
  }
  return <details className="booking-day-editor"><summary>Edit availability for this date</summary><p>{event.data.title} only · {event.data.timeZone}. Existing appointments are retained. No time windows means closed; weekly hours can be restored.</p><form onSubmit={(e) => { e.preventDefault(); void save(); }}><fieldset disabled={busy}>{windows.map((window, index) => <div className="booking-event-actions" key={index}><label>Start {index + 1}<input type="time" required value={window.start} onChange={(e) => setWindows(windows.map((item, i) => i === index ? { ...item, start: e.target.value } : item))} /></label><label>End {index + 1}<input type="time" required value={window.end} onChange={(e) => setWindows(windows.map((item, i) => i === index ? { ...item, end: e.target.value } : item))} /></label><button type="button" onClick={() => setWindows(windows.filter((_, i) => i !== index))}>Remove time window {index + 1}</button></div>)}<div className="booking-event-actions"><button type="button" disabled={windows.length >= 8} onClick={() => setWindows([...windows, { start: "09:00", end: "17:00" }])}>Add time window</button><button type="submit">{busy ? "Saving…" : windows.length ? "Save date availability" : "Close this date"}</button><button type="button" onClick={() => save(true)}>Restore weekly hours</button></div></fieldset>{message && <p role="alert">{message}</p>}</form></details>;
}
