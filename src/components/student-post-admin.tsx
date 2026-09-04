"use client";
import { useEffect, useState } from "react";
import type { StudentPost, StudentSummary } from "@/lib/student-posts";
import { StudentPostEditor } from "./student-post-editor";
export function StudentPostAdmin({ student }: { student: StudentSummary }) {
  const [posts, setPosts] = useState<StudentPost[] | null>(null); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<StudentPost | "new" | null>(null); const [deleting, setDeleting] = useState<StudentPost | null>(null);
  const [busy, setBusy] = useState(false); const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/student-posts?profileId=${student.id}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const result = await response.json(); if (!response.ok) throw new Error(result.error?.message || "Student updates could not be loaded."); setPosts(result.data.posts);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Student updates could not be loaded."); });
    return () => controller.abort();
  }, [student.id, revision]);
  async function mutate(action: string, data?: { title: string; body: string; isPublished: boolean }, post?: StudentPost) {
    const response = await fetch("/api/admin/student-posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, profileId: student.id, ...(data ? { data } : {}), ...(post ? { id: post.id, updatedAt: post.updatedAt } : {}) }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error?.message || "Student update could not be saved.");
    setPosts(null); setError(""); setRevision((current) => current + 1); setMessage(action === "delete" ? "Student update removed." : "Student update saved.");
  }
  async function remove() {
    if (!deleting || busy) return; setBusy(true); setError("");
    try { await mutate("delete", undefined, deleting); setDeleting(null); } catch (cause) { setError(cause instanceof Error ? cause.message : "Student update could not be removed."); } finally { setBusy(false); }
  }
  return <section className="student-post-admin" aria-labelledby="student-updates-heading"><header><div><h3 id="student-updates-heading">Updates for {student.name}</h3><p>{student.email}</p></div><button type="button" onClick={() => setEditing("new")} disabled={busy}>Add student update</button></header>
    {message && <p role="status">{message}</p>}{error && <div><p role="alert">{error}</p><button type="button" disabled={busy} onClick={() => { setError(""); setPosts(null); setRevision((current) => current + 1); }}>Reload student updates</button></div>}
    {deleting && <div className="curriculum-confirm" role="alert"><p>Remove “{deleting.title}” from {student.name}’s profile? This cannot be undone.</p><button type="button" disabled={busy} onClick={remove}>Confirm remove update</button><button type="button" disabled={busy} onClick={() => setDeleting(null)}>Keep update</button></div>}
    {!posts ? <p role="status">Loading student updates…</p> : posts.length === 0 ? <p>No updates posted to this student’s profile.</p> : posts.map((post) => <article key={post.id}><header><h4>{post.title}</h4><span>{post.isPublished ? "Published" : "Draft"}</span></header><p className="student-post-body">{post.body}</p><small>Updated {new Date(post.updatedAt).toLocaleString("en-JM", { timeZone: "America/Jamaica" })}</small><div className="curriculum-order"><button type="button" disabled={busy} onClick={() => setEditing(post)} aria-label={`Edit update ${post.title}`}>Edit</button><button type="button" disabled={busy} onClick={() => setDeleting(post)} aria-label={`Remove update ${post.title}`}>Remove</button></div></article>)}
    {editing && <StudentPostEditor student={student} post={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={(data) => mutate(editing === "new" ? "create" : "update", data, editing === "new" ? undefined : editing)} />}
  </section>;
}
