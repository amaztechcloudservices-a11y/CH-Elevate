"use client";
import { useEffect, useState } from "react";
type LearningCourse = { id: string; title: string; modules: { id: string; title: string; lessons: { id: string; title: string; contentType: "text" | "video" | "material"; text: string; videoUrl: string; downloadUrl: string | null }[] }[] };

export function StudentLearning() {
  const [courses, setCourses] = useState<LearningCourse[] | null>(null);
  const [error, setError] = useState(""); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/portal/learning", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.data)) throw new Error(result.error?.message || "Learning materials could not be loaded.");
      setCourses(result.data);
    }).catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Learning materials could not be loaded."); });
    return () => controller.abort();
  }, [attempt]);
  return <section className="student-learning" aria-labelledby="student-learning-heading">
    <h2 id="student-learning-heading">Your course learning</h2>
    <p>Modules, lessons and private downloads for your approved course enrolments.</p>
    {error ? <div><p role="alert">{error}</p><button type="button" onClick={() => { setError(""); setAttempt((current) => current + 1); }}>Retry learning materials</button></div> : !courses ? <p role="status">Loading your learning materials…</p> : courses.length === 0 ? <p>No approved course enrolments yet. Your learning materials will appear here after approval.</p> : courses.map((course) => <article key={course.id}>
      <h3>{course.title}</h3>
      {!course.modules.length && <p>Your instructor has not published modules yet.</p>}
      {course.modules.map((section, index) => <section key={section.id} className="student-learning__module">
        <h4>{index + 1}. {section.title}</h4>
        {!section.lessons.length && <p>Lessons will appear here when published.</p>}
        {section.lessons.map((lesson, lessonIndex) => <details key={lesson.id}>
          <summary>{lessonIndex + 1}. {lesson.title}<span>{lesson.contentType === "text" ? "Reading" : lesson.contentType === "video" ? "Video link" : "Download"}</span></summary>
          <div className="student-learning__content">
            {lesson.contentType === "text" && <p className="student-learning__text">{lesson.text}</p>}
            {lesson.contentType === "video" && <a href={lesson.videoUrl} target="_blank" rel="noopener noreferrer">Open video (new tab)</a>}
            {lesson.contentType === "material" && lesson.downloadUrl && <a href={lesson.downloadUrl}>Download course material</a>}
          </div>
        </details>)}
      </section>)}
    </article>)}
  </section>;
}
