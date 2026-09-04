"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { studentPostFields, type StudentPost, type StudentSummary } from "@/lib/student-posts";
export function StudentPostEditor({ student, post, onSave, onClose }: { student: StudentSummary; post: StudentPost | null; onSave: (data: { title: string; body: string; isPublished: boolean }) => Promise<void>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(post?.title || ""); const [body, setBody] = useState(post?.body || ""); const [isPublished, setPublished] = useState(post?.isPublished || false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const dirty = title !== (post?.title || "") || body !== (post?.body || "") || isPublished !== (post?.isPublished || false);
  useEffect(() => { dialog.current?.showModal(); dialog.current?.querySelector<HTMLInputElement>("input")?.focus(); }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function close() { if (!busy && (!dirty || window.confirm("Discard your unsaved student post?"))) onClose(); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    const parsed = studentPostFields.safeParse({ title, body, isPublished });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || "Review the post."); return; }
    setBusy(true); setError("");
    try { await onSave(parsed.data); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Post could not be saved."); setBusy(false); }
  }
  return <dialog ref={dialog} className="student-post-dialog" aria-labelledby="student-post-editor-heading" onCancel={(event) => { event.preventDefault(); close(); }}>
    <header><h2 id="student-post-editor-heading">{post ? "Edit student update" : "New student update"}</h2><button type="button" onClick={close} disabled={busy} aria-label="Close student update">Close</button></header>
    <form onSubmit={submit}><p>For <strong>{student.name}</strong><br />{student.email}</p><p>Published updates appear only on this student’s profile. This does not send an email.</p>
      <fieldset disabled={busy}><legend className="sr-only">Student update</legend>
        <label><span>Update title</span><input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={2} maxLength={180} autoFocus /></label>
        <label><span>Message to student</span><textarea value={body} onChange={(event) => setBody(event.target.value)} required minLength={2} maxLength={10000} rows={8} /></label>
        <p>Plain text only. Include only information this student should see.</p>
        <label className="curriculum-check"><input type="checkbox" checked={isPublished} onChange={(event) => setPublished(event.target.checked)} /><span>Publish on student profile</span></label>
        {error && <p role="alert">{error}</p>}
        <button type="submit">{busy ? "Saving…" : "Save student update"}</button>
      </fieldset>
    </form>
  </dialog>;
}
