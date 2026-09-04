"use client";
import { useEffect, useState } from "react";
import type { CurriculumSnapshot } from "@/lib/course-curriculum";
import { CourseCurriculumEditor } from "./course-curriculum-editor";

function CurriculumLoader({ courseId, onDirty, onReload, onBusy }: { courseId: string; onDirty: (dirty: boolean) => void; onReload: () => void; onBusy: (busy: boolean) => void }) {
  const [snapshot, setSnapshot] = useState<CurriculumSnapshot | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/course-curriculum?courseId=${encodeURIComponent(courseId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.data) throw new Error(result.error?.message || "Curriculum could not be loaded.");
        setSnapshot(result.data);
      }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Curriculum could not be loaded."); });
    return () => controller.abort();
  }, [courseId]);
  if (error) return <div><p role="alert">{error}</p><button type="button" onClick={onReload}>Retry curriculum</button></div>;
  if (!snapshot) return <p role="status">Loading curriculum…</p>;
  return <CourseCurriculumEditor snapshot={snapshot} onDirty={onDirty} onReload={onReload} onBusy={onBusy} />;
}

export function CourseCurriculumAdmin({ courses }: { courses: { id: string; title: string }[] }) {
  const [courseId, setCourseId] = useState(""); const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false); const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = () => { setDirty(false); setRevision((current) => current + 1); };
  return <section className="cms-card curriculum-admin" aria-labelledby="curriculum-heading">
    <h2 id="curriculum-heading">Modules &amp; lessons</h2>
    <p>Build the learning sequence for a course. Students with approved enrolments see published content on their profile.</p>
    <label><span>Course curriculum</span><select value={courseId} disabled={busy} onChange={(event) => {
      if (dirty) setPending(event.target.value); else setCourseId(event.target.value);
    }}><option value="">Select a course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
    {pending !== null && <div className="curriculum-confirm" role="alert"><p>Discard unsaved changes and switch courses?</p><button type="button" onClick={() => { setCourseId(pending); setPending(null); setDirty(false); }}>Discard and switch</button><button type="button" onClick={() => setPending(null)}>Keep editing this course</button></div>}
    {courseId ? <CurriculumLoader key={`${courseId}:${revision}`} courseId={courseId} onDirty={setDirty} onReload={reload} onBusy={setBusy} /> : <p>Select a course above. Create one in Courses &amp; offerings if the list is empty.</p>}
  </section>;
}
