"use client";

import { useRef, useState, type FormEvent } from "react";

type Registration = { registration: { id: string }; participantName: string; courseTitle: string; currency: string };
export function CourseInvoiceUpload({ registrations, refresh, onMessage }: { registrations: Registration[]; refresh: () => Promise<boolean>; onMessage: (message: string) => void }) {
  const [registrationId, setRegistrationId] = useState("");
  const [busy, setBusy] = useState(false); const inFlight = useRef(false);
  const currency = registrations.find((row) => row.registration.id === registrationId)?.currency;
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (inFlight.current) return;
    const element = event.currentTarget; const form = new FormData(element);
    const amount = String(form.get("amount") ?? "").trim();
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) { onMessage("Enter a non-negative amount with no more than two decimal places."); return; }
    const [whole, fraction = ""] = amount.split(".");
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(cents) || cents > 2147483647) { onMessage("The document amount is too large."); return; }
    form.delete("amount"); form.set("amountCents", String(cents));
    inFlight.current = true; setBusy(true); onMessage("Uploading payment document…");
    try {
      const response = await fetch("/api/admin/courses/invoices", { method: "POST", body: form });
      const result = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!response.ok) throw new Error(result?.error?.message || "Payment document upload failed. Your details have been kept for retry.");
      element.reset(); setRegistrationId("");
      try { if (!await refresh()) throw new Error("Refresh failed"); onMessage("Payment document assigned to the registration."); }
      catch { onMessage("Payment document uploaded, but the list could not refresh. Refresh the page; do not upload it again."); }
    } catch (error) { onMessage(error instanceof Error ? error.message : "Payment document upload failed. Your details have been kept for retry."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <form className="cms-card course-admin-form" onSubmit={upload} aria-busy={busy}>
    <div className="cms-card__heading"><h2>Assign payment document</h2></div>
    <p className="cms-field-note">Invoices and receipts are supporting documents. Uploading one does not change the registration total or payment status; update payment status separately after verification.</p>
    <label><span>Registration</span><select name="registrationId" value={registrationId} onChange={(event) => setRegistrationId(event.target.value)} required disabled={busy}><option value="">Select registration</option>{registrations.map((row) => <option key={row.registration.id} value={row.registration.id}>{row.participantName} · {row.courseTitle}</option>)}</select></label>
    <label><span>Document type</span><select name="documentType" disabled={busy}><option value="invoice">Invoice</option><option value="receipt">Receipt</option></select></label>
    <label><span>Reference</span><input name="reference" minLength={2} maxLength={100} required disabled={busy} /></label>
    <label><span>{currency ? `Amount (${currency})` : "Amount (select a registration)"}</span><input name="amount" type="number" min="0" max="21474836.47" step="0.01" required disabled={busy || !currency} /></label>
    <label><span>Due date (invoice only)</span><input name="dueAt" type="date" disabled={busy} /></label>
    <label><span>Notes</span><textarea name="notes" maxLength={1000} disabled={busy} /></label>
    <label><span>PDF file</span><input name="file" type="file" accept="application/pdf" required disabled={busy} /></label>
    <button type="submit" disabled={busy || !currency}>{busy ? "Uploading…" : "Upload document"}</button>
  </form>;
}
