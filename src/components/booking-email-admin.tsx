"use client";

import { useEffect, useState } from "react";
import { bookingMailKinds, bookingMailLabels, bookingMailPreviewValues, bookingMailSettingsSchema, bookingMailVariables, renderBookingMail, type BookingMailKind, type BookingMailSettings } from "@/lib/booking-mail";

type Delivery = { id: string; bookingId: string; kind: BookingMailKind; state: string; attempts: number; errorCode: string | null; updatedAt: string; customerName: string; service: string };
type Snapshot = { data: BookingMailSettings; updatedAt: string | null; deliveries: Delivery[]; total: number; pageSize: number; smtpConfigured: boolean; testRecipient: string };
const deliveryLabels: Record<string, string> = { pending: "Awaiting send", sending: "Sending / checking", accepted: "Accepted by mail server", failed: "Failed", unknown: "Delivery uncertain", superseded: "Booking changed — not sent", disabled: "Template disabled" };
async function read(response: Response) {
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Email settings could not be loaded.");
  return result;
}
export function BookingEmailAdmin() {
  const [editor, setEditor] = useState<{ data: BookingMailSettings; updatedAt: string | null } | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [kind, setKind] = useState<BookingMailKind>("received");
  const [page, setPage] = useState(1);
  const [attention, setAttention] = useState(true);
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reloadConfirm, setReloadConfirm] = useState(false);
  const [uncertainRetry, setUncertainRetry] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const requestKey = JSON.stringify([page, attention, revision]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/booking-emails?${new URLSearchParams({ page: String(page), attention: String(attention) })}`, { cache: "no-store", signal: controller.signal }).then(read).then((result: Snapshot) => {
      if (controller.signal.aborted) return;
      setSnapshot(result); setEditor((current) => current || { data: result.data, updatedAt: result.updatedAt }); setLoadedKey(requestKey);
    }).catch((error) => { if (!controller.signal.aborted) { setMessage(error instanceof Error ? error.message : "Unable to load emails."); setLoadedKey(requestKey); } });
    return () => controller.abort();
  }, [page, attention, requestKey]);
  async function action(input: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const result = await read(await fetch("/api/admin/booking-emails", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }));
      if (input.action === "save") { setEditor({ data: result.data, updatedAt: result.updatedAt }); setMessage("Booking email settings saved."); }
      else setMessage(`${deliveryLabels[result.result.state] || result.result.state}${result.result.errorCode ? ` (${result.result.errorCode})` : ""}.`);
      setUncertainRetry(null); setRevision((value) => value + 1);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Email operation failed."); }
    finally { setBusy(false); }
  }
  const template = editor?.data.templates[kind];
  const preview = template ? renderBookingMail(template, bookingMailPreviewValues) : null;
  function updateTemplate(patch: Partial<BookingMailSettings["templates"][BookingMailKind]>) {
    if (editor && template) setEditor({ ...editor, data: { ...editor.data, templates: { ...editor.data.templates, [kind]: { ...template, ...patch } } } });
  }
  return <div className="booking-admin booking-email-admin">
    <header className="cms-panel-heading"><span>Booking communications</span><h1>Email notifications.</h1><p>Manage booking senders, confirmation messages and delivery results independently of Website and Course settings.</p></header>
    {message && <p role="status" aria-label="Email operation result">{message}</p>}
    {!editor || !snapshot ? <><p>Loading booking emails…</p><button onClick={() => setRevision((value) => value + 1)}>Retry loading</button></> : <>
      <section className="cms-card"><h2>Sender &amp; templates</h2>
        <p>{snapshot.smtpConfigured ? "SMTP credentials are configured on the server. The sender address must be permitted by that mail account." : "SMTP is not configured. Settings can be saved, but sending will fail until the server has an SMTP connection."} SMTP credentials are never stored in this editor.</p>
        <form onSubmit={(event) => { event.preventDefault(); const parsed = bookingMailSettingsSchema.safeParse(editor.data); if (!parsed.success) { setMessage(parsed.error.issues[0]?.message || "Review the templates."); return; } void action({ action: "save", data: parsed.data, updatedAt: editor.updatedAt }); }}>
          <fieldset disabled={busy} className="booking-mail-fields"><div className="cms-form-grid">
            {([['senderName', 'Sender name'], ['senderEmail', 'Sender email'], ['replyTo', 'Reply-to email'], ['adminRecipient', 'Administrator notification email']] as const).map(([field, label]) => <label key={field}>{label}<input type={field === "senderName" ? "text" : "email"} required maxLength={field === "senderName" ? 120 : 254} value={editor.data[field]} onChange={(event) => setEditor({ ...editor, data: { ...editor.data, [field]: event.target.value } })} /></label>)}
          </div>
          <label className="booking-mail-select">Message template<select value={kind} onChange={(event) => setKind(event.target.value as BookingMailKind)}>{bookingMailKinds.map((value) => <option key={value} value={value}>{bookingMailLabels[value]}</option>)}</select></label>
          <label className="booking-mail-check"><input type="checkbox" checked={template!.enabled} onChange={(event) => updateTemplate({ enabled: event.target.checked })} />Enable this automatic message</label>
          <div className="booking-mail-template-grid"><div><label>Email subject<input required maxLength={200} value={template!.subject} onChange={(event) => updateTemplate({ subject: event.target.value })} /></label><label>Email message<textarea required maxLength={10000} rows={13} value={template!.text} onChange={(event) => updateTemplate({ text: event.target.value })} /></label></div><div className="booking-mail-preview"><h3>Preview · example data</h3><strong>{preview!.subject}</strong><pre>{preview!.text}</pre></div></div>
          <p>Plain-text messages only. Supported variables:</p><div className="booking-mail-variables">{bookingMailVariables.map((value) => <code key={value}>{`{{${value}}}`}</code>)}</div>
          <div className="booking-event-actions"><button type="submit">{busy ? "Working…" : "Save email settings"}</button><button type="button" onClick={() => setReloadConfirm(true)}>Reload saved settings</button></div>
          {reloadConfirm && <div><p>Discard unsaved email edits and reload the saved settings?</p><div className="booking-event-actions"><button type="button" onClick={() => { setEditor(null); setReloadConfirm(false); setRevision((value) => value + 1); }}>Discard edits and reload</button><button type="button" onClick={() => setReloadConfirm(false)}>Keep editing</button></div></div>}
          </fieldset>
        </form>
        <h3>Test a saved template</h3><p>Sends example content for the selected template to your signed-in email only: {snapshot.testRecipient}. Save edits first. A successful result means the mail server accepted the message, not a guarantee of inbox delivery.</p><button type="button" disabled={busy || !snapshot.smtpConfigured} onClick={() => action({ action: "test", kind })}>Send test email to me</button>
      </section>
      <section className="cms-card" aria-label="Booking email delivery history"><h2>Delivery history</h2><p>Retries use the current saved sender and template. If the booking has changed or was deleted, its previous message is not sent. Review the current booking to send an up-to-date status email.</p>
        <div className="booking-event-actions"><label className="booking-mail-check"><input type="checkbox" checked={attention} onChange={(event) => { setAttention(event.target.checked); setPage(1); }} />Only messages needing attention</label><button disabled={busy} onClick={() => setRevision((value) => value + 1)}>Refresh delivery status</button></div>
        {loadedKey !== requestKey ? <p role="status">Loading delivery history…</p> : <><div className="booking-request-list">{snapshot.deliveries.map((item) => <article key={item.id}><div><h3>{bookingMailLabels[item.kind]}</h3><p>{item.customerName} · {item.service}</p><p>Booking {item.bookingId}</p></div><div><strong>{deliveryLabels[item.state]}</strong><p>{item.attempts} attempt(s) · {new Date(item.updatedAt).toLocaleString()}</p>{item.errorCode && <p>{item.errorCode}</p>}</div>{["pending", "failed", "sending", "unknown"].includes(item.state) && <button disabled={busy} onClick={() => item.state === "unknown" ? setUncertainRetry(item.id) : action({ action: "retry", id: item.id })}>{item.state === "sending" ? "Check stalled send" : "Retry delivery"}</button>}
          {uncertainRetry === item.id && <div className="booking-mail-uncertain"><p>The previous send may have reached the mail server. Retrying could send a duplicate. Continue?</p><div className="booking-event-actions"><button disabled={busy} onClick={() => action({ action: "retry", id: item.id, confirmUnknown: true })}>Retry despite duplicate risk</button><button disabled={busy} onClick={() => setUncertainRetry(null)}>Cancel retry</button></div></div>}
        </article>)}</div>{!snapshot.deliveries.length && <p>No messages in this view.</p>}<div className="booking-event-actions"><button disabled={busy || page <= 1} onClick={() => setPage((value) => value - 1)}>Previous delivery page</button><span>Page {page} of {Math.max(1, Math.ceil(snapshot.total / snapshot.pageSize))}</span><button disabled={busy || page * snapshot.pageSize >= snapshot.total} onClick={() => setPage((value) => value + 1)}>Next delivery page</button></div></>}
      </section>
    </>}
  </div>;
}
