"use client";
import { useState, type FormEvent } from "react";

type Props = {
  courses: { id: string; title: string }[];
  offerings: { offering: { id: string; courseId: string; code: string } }[];
  registrations: { participantProfileId?: string | null; participantName: string; participantEmail: string; courseId?: string; offeringId?: string }[];
  onUploaded: () => Promise<void>;
};
export function CourseMaterialUpload({ courses, offerings, registrations, onUploaded }: Props) {
  const [courseId, setCourseId] = useState(""); const [offeringId, setOfferingId] = useState(""); const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [failed, setFailed] = useState(false);
  const students = [...new Map(registrations.filter((row) => row.participantProfileId && row.courseId === courseId && (!offeringId || row.offeringId === offeringId)).map((row) => [row.participantProfileId!, row])).entries()];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget; const body = new FormData(form); setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch("/api/admin/courses/materials", { method: "POST", body }); const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Upload failed. Your selection has been kept.");
      form.reset(); setCourseId(""); setOfferingId(""); setRecipient("");
      setMessage(`Material uploaded as version ${result.data.version}. It is available to the assigned approved students.`);
      try { await onUploaded(); } catch { setMessage("Material uploaded. Refresh the list to see the saved file; do not upload it again."); }
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Upload failed. Please try again."); }
    finally { setBusy(false); }
  }
  return <form className="cms-card course-admin-form course-material-upload" onSubmit={submit}>
    <div className="cms-card__heading"><h2>Upload and assign material</h2></div>
    <p>Share with approved students in a course, one offering, or one student. Student-specific files are not shared with their organisation coordinator.</p>
    <fieldset disabled={busy}>
      <label><span>Material title</span><input name="title" required minLength={2} maxLength={180} /></label>
      <label><span>Assign to course</span><select name="courseId" required value={courseId} onChange={(event) => { setCourseId(event.target.value); setOfferingId(""); setRecipient(""); }}><option value="">Select course</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
      <label><span>Specific offering (optional)</span><select name="offeringId" value={offeringId} onChange={(event) => { setOfferingId(event.target.value); setRecipient(""); }}><option value="">All offerings of this course</option>{offerings.filter((row) => row.offering.courseId === courseId).map(({ offering }) => <option key={offering.id} value={offering.id}>{offering.code}</option>)}</select></label>
      <label><span>Student assignment</span><select name="recipientProfileId" value={recipient} onChange={(event) => setRecipient(event.target.value)}><option value="">All approved students in this scope</option>{students.map(([id, student]) => <option key={id} value={id}>{student.participantName} — {student.participantEmail}</option>)}</select></label>
      {courseId && !students.length && <p>No linked student accounts in this scope yet. Students must activate their account and be linked to their registration before individual assignment.</p>}
      <p>Uploading the same title to the same course, offering and student replaces the active version. Previous files remain archived. Approval is required before download.</p>
      <label><span>File</span><input name="file" type="file" accept=".pdf,.docx,.xlsx,.pptx,.txt,.csv" required /></label>
      <p>PDF, DOCX, XLSX, PPTX, UTF-8 TXT or CSV; up to 25 MB. Macro-enabled documents are not accepted.</p>
      <button type="submit" disabled={!courseId}>{busy ? "Uploading material…" : "Upload secure material"}</button>
    </fieldset>
    {message && <p role={failed ? "alert" : "status"}>{message}</p>}
  </form>;
}
