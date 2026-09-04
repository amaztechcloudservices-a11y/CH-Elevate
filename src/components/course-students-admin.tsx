"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { StudentSummary } from "@/lib/student-posts";
import { StudentPostAdmin } from "./student-post-admin";
export function CourseStudentsAdmin() {
  const [query, setQuery] = useState({ search: "", page: 1, revision: 0 });
  const [result, setResult] = useState<{ data: StudentSummary[]; total: number; page: number } | null>(null);
  const [selected, setSelected] = useState<StudentSummary | null>(null); const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/students?${new URLSearchParams({ search: query.search, page: String(query.page) })}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || "Students could not be loaded."); setResult(body);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Students could not be loaded."); });
    return () => controller.abort();
  }, [query]);
  function search(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const value = String(new FormData(event.currentTarget).get("search") || ""); setError(""); setResult(null); setQuery({ search: value, page: 1, revision: query.revision + 1 }); }
  return <section className="cms-card course-students-admin" aria-labelledby="course-students-heading"><h2 id="course-students-heading">Student profiles</h2><p>Find an active student account and post information to their private profile. Students must have activated or registered their account first.</p>
    <form onSubmit={search} className="student-search"><label><span>Search students by name or email</span><input name="search" maxLength={120} type="search" /></label><button type="submit">Find students</button></form>
    {error && <div><p role="alert">{error}</p><button type="button" onClick={() => { setError(""); setQuery({ ...query, revision: query.revision + 1 }); }}>Retry student search</button></div>}
    {!result ? !error && <p role="status">Loading student accounts…</p> : <><p>{result.total} active student {result.total === 1 ? "account" : "accounts"}</p><div className="student-search-results">{result.data.map((student) => <button type="button" key={student.id} aria-pressed={selected?.id === student.id} onClick={() => setSelected(student)}><strong>{student.name}</strong><span>{student.email}</span></button>)}</div>{!result.data.length && <p>No matching active student accounts.</p>}<nav className="curriculum-order" aria-label="Student search pages"><button type="button" disabled={result.page <= 1} onClick={() => { setResult(null); setQuery({ ...query, page: query.page - 1 }); }}>Previous students</button><span>Page {result.page} of {Math.max(1, Math.ceil(result.total / 25))}</span><button type="button" disabled={result.page * 25 >= result.total} onClick={() => { setResult(null); setQuery({ ...query, page: query.page + 1 }); }}>Next students</button></nav></>}
    {selected && <StudentPostAdmin key={selected.id} student={selected} />}
  </section>;
}
