import { expect, it } from "vitest";
import { curriculumSchema, lessonSchema, newLesson, newModule } from "./course-curriculum";
it("validates supported formats without quizzes or executable URLs", () => {
  expect(lessonSchema.safeParse(newLesson()).success).toBe(true);
  for (const contentType of ["quiz", "assignment", "scorm"]) expect(lessonSchema.safeParse({ ...newLesson(), contentType }).success).toBe(false);
  for (const videoUrl of ["javascript:alert(1)", "data:text/html,test", "http://example.test/video", "https://user:secret@example.test/video"]) expect(lessonSchema.safeParse({ ...newLesson(), videoUrl }).success).toBe(false);
});
it("requires published content and rejects duplicate or excessive lesson identities", () => {
  expect(lessonSchema.safeParse({ ...newLesson(), isPublished: true }).success).toBe(false);
  expect(lessonSchema.safeParse({ ...newLesson(), isPublished: true, text: "<script>plain text only</script>" }).success).toBe(true);
  const section = newModule();
  expect(curriculumSchema.safeParse({ courseId: crypto.randomUUID(), updatedAt: new Date().toISOString(), modules: [section, section] }).success).toBe(false);
});
