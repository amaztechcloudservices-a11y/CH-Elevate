"use client";
import type { CurriculumLesson } from "@/lib/course-curriculum";

export function CourseLessonEditor({ lesson, position, count, materials, onChange, onMove, onRemove }: {
  lesson: CurriculumLesson; position: number; count: number; materials: { id: string; title: string }[];
  onChange: (changes: Partial<CurriculumLesson>) => void; onMove: (direction: number) => void; onRemove: () => void;
}) {
  return <fieldset className="curriculum-lesson"><legend>Lesson {position + 1}</legend>
    <div className="curriculum-order"><button type="button" aria-label={`Move lesson ${position + 1} up`} disabled={position === 0} onClick={() => onMove(-1)}>Move up</button><button type="button" aria-label={`Move lesson ${position + 1} down`} disabled={position === count - 1} onClick={() => onMove(1)}>Move down</button><button type="button" onClick={onRemove}>Remove lesson</button></div>
    <label><span>Lesson title</span><input value={lesson.title} onChange={(event) => onChange({ title: event.target.value })} minLength={2} maxLength={180} required /></label>
    <label><span>Lesson format</span><select value={lesson.contentType} onChange={(event) => onChange({ contentType: event.target.value as CurriculumLesson["contentType"] })}><option value="text">Text</option><option value="video">HTTPS video link</option><option value="material">Private download</option></select></label>
    {lesson.contentType === "text" && <label><span>Lesson text</span><textarea aria-label="Lesson text" value={lesson.text} rows={6} maxLength={20000} onChange={(event) => onChange({ text: event.target.value })} /><small>Plain text only. HTML and scripts are displayed as text.</small></label>}
    {lesson.contentType === "video" && <label><span>Video URL</span><input aria-label="Video URL" value={lesson.videoUrl} type="url" maxLength={2000} onChange={(event) => onChange({ videoUrl: event.target.value })} /><small>HTTPS only. Students choose when to open the link; the video host controls access to its video file.</small></label>}
    {lesson.contentType === "material" && <label><span>Downloadable material</span><select aria-label="Downloadable material" value={lesson.materialId || ""} onChange={(event) => onChange({ materialId: event.target.value || null })}><option value="">Choose a material</option>{lesson.materialId && !materials.some((material) => material.id === lesson.materialId) && <option value={lesson.materialId} disabled>Unavailable material — choose a replacement</option>}{materials.map((material) => <option key={material.id} value={material.id}>{material.title}</option>)}</select><small>Upload a course-wide file in Materials first. Archived or offering-specific files cannot be attached here.</small></label>}
    <label className="curriculum-check"><input type="checkbox" checked={lesson.isPublished} onChange={(event) => onChange({ isPublished: event.target.checked })} /><span>Publish lesson</span></label>
  </fieldset>;
}
