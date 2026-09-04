"use client";

import Image from "next/image";
import { Copy, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { defaultCourseCatalogueSection, emptyCourse, websitePageOptions, type CourseCatalogueInput, type CourseCatalogueRecord, type CourseCatalogueSectionRecord } from "@/lib/course-catalogue";
import { CourseCatalogueEditor, type CatalogueOption } from "./course-catalogue-editor";
import { LocalImageUpload } from "./local-image-upload";

type Snapshot = { data: CourseCatalogueRecord[]; categories: CatalogueOption[]; instructors: CatalogueOption[]; section: CourseCatalogueSectionRecord };
async function mutate(body: object) {
  const response = await fetch("/api/admin/course-catalogue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "The course could not be updated.");
  return result.data;
}
const editable = (course: CourseCatalogueRecord): CourseCatalogueInput => Object.fromEntries(Object.keys(emptyCourse).map((key) => [key, course[key as keyof CourseCatalogueInput]])) as CourseCatalogueInput;

function CatalogueSectionSettings({ initial, onSaved }: { initial: CourseCatalogueSectionRecord; onSaved: (section: CourseCatalogueSectionRecord) => void }) {
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState({ busy: false, message: "", error: "" });
  const [imageBusy, setImageBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (imageBusy) return;
    setStatus({ busy: true, message: "", error: "" });
    try {
      const saved = await mutate({ action: "section", updatedAt: draft.updatedAt, data: {
        isPublished: draft.isPublished, pageSlug: draft.pageSlug, backgroundType: draft.backgroundType,
        backgroundColor: draft.backgroundColor, backgroundImageUrl: draft.backgroundImageUrl,
      } }) as CourseCatalogueSectionRecord;
      setDraft(saved); onSaved(saved); setStatus({ busy: false, message: "Catalogue section saved and the website updated.", error: "" });
    } catch (cause) { setStatus({ busy: false, message: "", error: cause instanceof Error ? cause.message : "The catalogue section could not be saved." }); }
  }
  return <section className="course-catalogue-section-settings cms-card" aria-label="Published catalogue section">
    <div className="cms-card__heading"><div><h3>Published catalogue section</h3><p>Place the course cards on any main website page and control their background.</p></div></div>
    <form onSubmit={save}>
      <label className="course-catalogue-switch"><input type="checkbox" role="switch" aria-label="Publish catalogue section" checked={draft.isPublished} disabled={status.busy} onChange={(event) => setDraft({ ...draft, isPublished: event.target.checked })} /><span><strong>{draft.isPublished ? "Published" : "Unpublished"}</strong><small>The section appears only when this switch is on.</small></span></label>
      <div className="course-catalogue-section-fields">
        <label><span>Website page</span><select value={draft.pageSlug} disabled={status.busy} onChange={(event) => setDraft({ ...draft, pageSlug: event.target.value as CourseCatalogueSectionRecord["pageSlug"] })}>{websitePageOptions.map((page) => <option key={page.slug} value={page.slug}>{page.label}</option>)}</select></label>
        <label><span>Background style</span><select value={draft.backgroundType} disabled={status.busy} onChange={(event) => setDraft({ ...draft, backgroundType: event.target.value as "color" | "image" })}><option value="color">Solid color</option><option value="image">Background image</option></select></label>
        <label><span>Background color</span><span className="course-catalogue-color"><input type="color" aria-label="Background color picker" value={draft.backgroundColor} disabled={status.busy} onChange={(event) => setDraft({ ...draft, backgroundColor: event.target.value })} /><input aria-label="Background color" value={draft.backgroundColor} disabled={status.busy} pattern="#[0-9A-Fa-f]{6}" onChange={(event) => setDraft({ ...draft, backgroundColor: event.target.value })} /></span></label>
        {draft.backgroundType === "image" && <LocalImageUpload label="Background image" value={draft.backgroundImageUrl} onUploaded={(backgroundImageUrl) => setDraft({ ...draft, backgroundImageUrl })} disabled={status.busy} required onBusyChange={setImageBusy} />}
      </div>
      {status.error && <p role="alert">{status.error}</p>}{status.message && <p role="status">{status.message}</p>}
      <button type="submit" disabled={status.busy || imageBusy}>{status.busy ? "Saving…" : imageBusy ? "Uploading image…" : "Save catalogue section"}</button>
    </form>
  </section>;
}
export function CourseCatalogueAdmin({ onChanged }: { onChanged: () => Promise<void> }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<{ course?: CourseCatalogueRecord; readOnly: boolean } | null>(null);
  const [deleting, setDeleting] = useState<CourseCatalogueRecord | null>(null); const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  async function reload() {
    const response = await fetch("/api/admin/course-catalogue", { cache: "no-store" }); const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || "The course catalogue could not be loaded.");
    setSnapshot({ ...result, section: result.section || { ...defaultCourseCatalogueSection, updatedAt: null } });
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/course-catalogue", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const result = await response.json(); if (!response.ok) throw new Error(result.error?.message || "The course catalogue could not be loaded."); setSnapshot({ ...result, section: result.section || { ...defaultCourseCatalogueSection, updatedAt: null } });
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load catalogue."); });
    return () => controller.abort();
  }, []);
  async function action(course: CourseCatalogueRecord, name: "duplicate" | "delete") {
    setBusy(true); setError(""); setMessage("");
    try {
      await mutate({ action: name, id: course.id, updatedAt: course.updatedAt });
      setDeleting(null); await reload(); await onChanged();
      setMessage(name === "delete" ? "Course deleted." : "Draft copy created. Review and publish it when ready.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Course could not be updated."); } finally { setBusy(false); }
  }
  return <section className="course-catalogue-admin" aria-label="Course catalogue">
    <div className="cms-toolbar"><h2>Course catalogue</h2><button type="button" onClick={() => { setError(""); setEditor({ readOnly: false }); }} disabled={!snapshot || busy}><Plus aria-hidden="true" /> Add New Course</button></div>
    <p className="course-catalogue-admin__intro">Create reusable course cards, choose where the catalogue appears, and schedule an offering to open registration.</p>
    {error && <p role="alert">{error} <button type="button" onClick={() => { setError(""); reload().catch((cause) => setError(cause.message)); }}>Reload catalogue</button></p>}
    {message && <p role="status">{message}</p>}
    {!snapshot && !error && <p role="status">Loading course catalogue…</p>}
    {snapshot && <>
      <CatalogueSectionSettings initial={snapshot.section} onSaved={(section) => setSnapshot((current) => current && ({ ...current, section }))} />
      <label className="course-catalogue-search"><span>Find a course</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="course-catalogue-grid">{snapshot.data.filter((course) => `${course.title} ${course.slug}`.toLowerCase().includes(search.toLowerCase())).map((course) => <article key={course.id} className="course-catalogue-card">
        {course.bannerUrl ? <Image src={course.bannerUrl} alt="" width={720} height={405} unoptimized /> : <div className="course-catalogue-no-image">No banner selected</div>}
        <div className="course-catalogue-card__body"><span className="course-status">{course.status}{course.accessType === "private" ? " · private" : ""}</span><h3>{course.title}</h3>{course.subtitle && <p className="course-catalogue-subtitle">{course.subtitle}</p>}<p>{course.summary}</p><small>/{course.slug}</small>
          <div className="course-catalogue-actions">
            <button type="button" aria-label={`View ${course.title}`} onClick={() => setEditor({ course, readOnly: true })}><Eye aria-hidden="true" /> View</button>
            <button type="button" aria-label={`Edit ${course.title}`} onClick={() => setEditor({ course, readOnly: false })} disabled={busy}><Pencil aria-hidden="true" /> Edit</button>
            <button type="button" aria-label={`Duplicate ${course.title}`} onClick={() => action(course, "duplicate")} disabled={busy}><Copy aria-hidden="true" /> Duplicate</button>
            <button type="button" aria-label={`Delete ${course.title}`} onClick={() => setDeleting(course)} disabled={busy}><Trash2 aria-hidden="true" /> Delete</button>
          </div>
          {deleting?.id === course.id && <div role="alert"><p>Delete “{course.title}”? Courses with offerings, materials or curriculum must be archived instead.</p><button type="button" onClick={() => action(course, "delete")} disabled={busy}>Confirm delete</button><button type="button" onClick={() => setDeleting(null)} disabled={busy}>Keep course</button></div>}
        </div>
      </article>)}</div>
      {!snapshot.data.length && <p className="cms-empty">No courses yet. Add your first course to begin.</p>}
      {editor && <CourseCatalogueEditor initial={editor.course ? editable(editor.course) : emptyCourse} categories={snapshot.categories} instructors={snapshot.instructors} readOnly={editor.readOnly} onClose={() => setEditor(null)}
        onCategory={async (name) => { const category = await mutate({ action: "category", name }); setSnapshot((current) => current && ({ ...current, categories: [...current.categories, category] })); return category.id; }}
        onSave={async (data) => {
          await mutate(editor.course ? { action: "update", id: editor.course.id, updatedAt: editor.course.updatedAt, data } : { action: "create", data });
          setEditor(null); setMessage("Course saved.");
          try { await reload(); await onChanged(); } catch { setError("The course was saved, but the list could not be refreshed. Reload the catalogue before editing again."); }
        }} />}
    </>}
  </section>;
}
