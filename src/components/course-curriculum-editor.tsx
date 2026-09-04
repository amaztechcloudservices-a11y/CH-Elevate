"use client";
import { useEffect, useState, type FormEvent } from "react";
import { curriculumSchema, newLesson, newModule, type CurriculumModule, type CurriculumSnapshot } from "@/lib/course-curriculum";
import { CourseLessonEditor } from "./course-lesson-editor";

function moved<T>(items: T[], index: number, delta: number) {
  const next = [...items]; const target = index + delta;
  if (target >= 0 && target < items.length) [next[index], next[target]] = [next[target], next[index]];
  return next;
}
export function CourseCurriculumEditor({ snapshot, onReload, onDirty, onBusy }: { snapshot: CurriculumSnapshot; onReload: () => void; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void }) {
  const [modules, setModules] = useState(snapshot.modules); const [saved, setSaved] = useState(JSON.stringify(snapshot.modules));
  const [updatedAt, setUpdatedAt] = useState(snapshot.course.updatedAt); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const [removing, setRemoving] = useState<{ moduleId: string; lessonId?: string } | null>(null); const [reloadConfirm, setReloadConfirm] = useState(false);
  const dirty = JSON.stringify(modules) !== saved;
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => { onBusy(busy); }, [busy, onBusy]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const patch = (id: string, changes: Partial<CurriculumModule>) => { setError(""); setMessage(""); setModules((current) => current.map((section) => section.id === id ? { ...section, ...changes } : section)); };
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const parsed = curriculumSchema.safeParse({ courseId: snapshot.course.id, updatedAt, modules });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Review the curriculum."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/course-curriculum", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error?.message || "Curriculum could not be saved.");
      setUpdatedAt(result.updatedAt); setSaved(JSON.stringify(modules)); setMessage("Curriculum saved. Only published modules and lessons are visible to approved students.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Curriculum could not be saved."); } finally { setBusy(false); }
  }
  function remove() {
    if (!removing) return;
    setModules((current) => removing.lessonId ? current.map((section) => section.id === removing.moduleId ? { ...section, lessons: section.lessons.filter((lesson) => lesson.id !== removing.lessonId) } : section) : current.filter((section) => section.id !== removing.moduleId));
    setRemoving(null);
  }
  return <form className="curriculum-editor" onSubmit={save}>
    <div className="curriculum-toolbar"><h3>{snapshot.course.title}</h3><span>{dirty ? "Unsaved changes" : "Saved curriculum"}</span></div>
    <p>Arrange up to 50 modules and 200 lessons. Publishing a lesson also requires its module to be published. Changes, including removals, apply when you save.</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <fieldset disabled={busy} className="curriculum-editor__body"><legend className="sr-only">Curriculum content</legend>
      {removing && <div className="curriculum-confirm" role="alert"><p>Remove this {removing.lessonId ? "lesson" : "module and all its lessons"}? Saving will remove its content from students’ view. Uploaded files are retained.</p><button type="button" onClick={remove}>Confirm removal</button><button type="button" onClick={() => setRemoving(null)}>Keep content</button></div>}
      {modules.map((section, index) => <section className="curriculum-module" key={section.id} aria-label={`Module ${index + 1}`}>
        <header><h4>Module {index + 1}</h4><div className="curriculum-order"><button type="button" aria-label={`Move module ${index + 1} up`} disabled={index === 0} onClick={() => setModules(moved(modules, index, -1))}>Move up</button><button type="button" aria-label={`Move module ${index + 1} down`} disabled={index === modules.length - 1} onClick={() => setModules(moved(modules, index, 1))}>Move down</button><button type="button" onClick={() => setRemoving({ moduleId: section.id })}>Remove module</button></div></header>
        <label><span>Module title</span><input value={section.title} onChange={(event) => patch(section.id, { title: event.target.value })} minLength={2} maxLength={180} required /></label>
        <label className="curriculum-check"><input type="checkbox" checked={section.isPublished} onChange={(event) => patch(section.id, { isPublished: event.target.checked })} /><span>Publish module</span></label>
        {section.lessons.map((lesson, lessonIndex) => <CourseLessonEditor key={lesson.id} lesson={lesson} position={lessonIndex} count={section.lessons.length} materials={snapshot.materials}
          onChange={(changes) => patch(section.id, { lessons: section.lessons.map((item) => item.id === lesson.id ? { ...item, ...changes } : item) })}
          onMove={(delta) => patch(section.id, { lessons: moved(section.lessons, lessonIndex, delta) })} onRemove={() => setRemoving({ moduleId: section.id, lessonId: lesson.id })} />)}
        <button type="button" disabled={section.lessons.length >= 100 || modules.reduce((sum, item) => sum + item.lessons.length, 0) >= 200} onClick={() => patch(section.id, { lessons: [...section.lessons, newLesson()] })}>Add lesson</button>
      </section>)}
      {!modules.length && <p>No modules yet. Add a module to organise this course.</p>}
      <button type="button" disabled={modules.length >= 50} onClick={() => setModules([...modules, newModule()])}>Add module</button>
      <div className="curriculum-toolbar"><button type="submit">{busy ? "Saving…" : "Save curriculum"}</button><button type="button" onClick={() => dirty ? setReloadConfirm(true) : onReload()}>Reload saved curriculum</button></div>
      {reloadConfirm && <div className="curriculum-confirm" role="alert"><p>Discard your unsaved curriculum changes?</p><button type="button" onClick={onReload}>Discard and reload</button><button type="button" onClick={() => setReloadConfirm(false)}>Keep editing</button></div>}
    </fieldset>
  </form>;
}
