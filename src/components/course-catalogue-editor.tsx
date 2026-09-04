"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { courseCatalogueSchema, type CourseCatalogueInput } from "@/lib/course-catalogue";
import { LocalImageUpload } from "./local-image-upload";

export type CatalogueOption = { id: string; name: string };
export function CourseCatalogueEditor({ initial, categories, instructors, readOnly, onSave, onCategory, onClose }: {
  initial: CourseCatalogueInput; categories: CatalogueOption[]; instructors: CatalogueOption[]; readOnly: boolean;
  onSave: (data: CourseCatalogueInput) => Promise<void>; onCategory: (name: string) => Promise<string>; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState(initial); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const [priceText, setPriceText] = useState(String(initial.priceCents / 100));
  const [categoryName, setCategoryName] = useState(""); const [discard, setDiscard] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!; dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  const patch = (changes: Partial<CourseCatalogueInput>) => { setError(""); setData((current) => ({ ...current, ...changes })); };
  function close() { if (busy || imageBusy) return; if (!readOnly && JSON.stringify(data) !== JSON.stringify(initial)) setDiscard(true); else onClose(); }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || imageBusy || readOnly) return;
    const parsed = courseCatalogueSchema.safeParse(data);
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(" ")); return; }
    setBusy(true); setError("");
    try { await onSave(parsed.data); } catch (cause) { setError(cause instanceof Error ? cause.message : "Course could not be saved."); } finally { setBusy(false); }
  }
  async function addCategory() {
    if (busy || imageBusy || !categoryName.trim()) return;
    setBusy(true); setError("");
    try { patch({ categoryId: await onCategory(categoryName) }); setCategoryName(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Category could not be created."); } finally { setBusy(false); }
  }
  return <dialog ref={ref} className="course-catalogue-dialog" aria-labelledby="catalogue-dialog-title" onCancel={(event) => { event.preventDefault(); close(); }}>
    <header><h2 id="catalogue-dialog-title">{readOnly ? "View course" : initial.title ? "Edit course" : "Add New Course"}</h2><button type="button" aria-label="Close course dialog" onClick={close} disabled={busy || imageBusy}><X aria-hidden="true" /></button></header>
    {discard && <div className="course-catalogue-discard" role="alert"><p>Discard unsaved course changes?</p><button type="button" onClick={onClose}>Discard changes</button><button type="button" onClick={() => setDiscard(false)}>Keep editing</button></div>}
    <form onSubmit={save} className="course-catalogue-form">
      <p>Course identity and access information. Fees are recorded for offline arrangements; no gateway, checkout or automatic subscription charge is created. Scheduled offerings retain their own dates, fees and capacity.</p>
      {error && <p role="alert">{error}</p>}
      <fieldset disabled={busy || imageBusy || readOnly}>
        <legend>Course identity</legend>
        <div className="course-catalogue-fields">
          <label><span>Course title</span><input value={data.title} onChange={(event) => patch({ title: event.target.value })} minLength={3} maxLength={180} required /></label>
          <label><span>URL slug</span><input value={data.slug} onChange={(event) => patch({ slug: event.target.value })} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={180} required /></label>
          <label className="wide"><span>Subtitle</span><input value={data.subtitle} onChange={(event) => patch({ subtitle: event.target.value })} maxLength={240} /></label>
          <label className="wide"><span>Short summary</span><textarea value={data.summary} onChange={(event) => patch({ summary: event.target.value })} minLength={10} maxLength={500} rows={2} required /></label>
          <label className="wide"><span>Full description</span><textarea value={data.description} onChange={(event) => patch({ description: event.target.value })} minLength={10} maxLength={10000} rows={5} required /></label>
          <LocalImageUpload className="wide" label="Banner image" value={data.bannerUrl} onUploaded={(bannerUrl) => patch({ bannerUrl })} disabled={busy} readOnly={readOnly} required={data.status === "published"} onBusyChange={setImageBusy} />
          <label><span>Instructor</span><select value={data.instructorId || ""} onChange={(event) => patch({ instructorId: event.target.value || null })}><option value="">Choose instructor</option>{instructors.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label>
          <label><span>Category</span><select value={data.categoryId || ""} onChange={(event) => patch({ categoryId: event.target.value || null })}><option value="">Choose category</option>{categories.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}</select></label>
        </div>
        {!readOnly && <div className="course-catalogue-category"><label><span>New category name</span><input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} maxLength={80} /></label><button type="button" disabled={!categoryName.trim()} onClick={addCategory}>Add category</button></div>}
      </fieldset>
      <fieldset disabled={busy || imageBusy || readOnly}><legend>Publication and access</legend><div className="course-catalogue-fields">
        <label><span>Publication status</span><select value={data.status} onChange={(event) => patch({ status: event.target.value as CourseCatalogueInput["status"] })}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
        <label><span>Skill level</span><select value={data.skillLevel} onChange={(event) => patch({ skillLevel: event.target.value as CourseCatalogueInput["skillLevel"] })}>{["all_levels", "beginner", "intermediate", "advanced"].map((level) => <option key={level} value={level}>{level.replaceAll("_", " ")}</option>)}</select></label>
        <label><span>Access type</span><select value={data.accessType} onChange={(event) => { if (event.target.value === "free") setPriceText("0"); patch({ accessType: event.target.value as CourseCatalogueInput["accessType"], ...(event.target.value === "free" ? { priceCents: 0 } : {}) }); }}><option value="free">Free</option><option value="one_time">One-time fee (offline)</option><option value="subscription">Subscription (offline)</option><option value="private">Private / internal</option></select></label>
        <label><span>Currency</span><select value={data.currency} onChange={(event) => patch({ currency: event.target.value as CourseCatalogueInput["currency"] })}>{["JMD", "USD", "GBP", "EUR", "CAD"].map((currency) => <option key={currency}>{currency}</option>)}</select></label>
        <label><span>Course price</span><input type="number" min="0" max="1000000" step="0.01" value={priceText} disabled={data.accessType === "free"} onChange={(event) => { setPriceText(event.target.value); patch({ priceCents: event.target.value === "" ? Number.NaN : Math.round(Number(event.target.value) * 100) }); }} required /></label>
        <label><span>Enrolment limit</span><input type="number" min="1" max="1000000" value={data.enrollmentLimit ?? ""} onChange={(event) => patch({ enrollmentLimit: event.target.value ? Number(event.target.value) : null })} /><small>Leave blank for unlimited. Counts approved/completed participant enrolments across all offerings, including past offerings. Excess applications are waitlisted; the offering override does not bypass this limit.</small></label>
        <label className="wide"><span>Subscription information</span><textarea value={data.subscription} onChange={(event) => patch({ subscription: event.target.value })} maxLength={300} rows={2} required={data.accessType === "subscription"} /><small>Shown publicly only for subscription courses. Changing access type keeps these notes for editing; it does not schedule charges or change student approval.</small></label>
      </div></fieldset>
      <p>Publish requires a subtitle, banner, instructor and category. Private/internal courses are not advertised publicly. Duplicates copy catalogue fields only—not offerings, students or files.</p>
      <footer><button type="button" disabled={busy || imageBusy} onClick={close}>{readOnly ? "Close" : "Cancel"}</button>{!readOnly && <button type="submit" disabled={busy || imageBusy}>{busy ? "Saving…" : imageBusy ? "Uploading image…" : "Save course"}</button>}</footer>
    </form>
  </dialog>;
}
