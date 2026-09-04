import { z } from "zod";

export const lessonSchema = z.object({
  id: z.uuid(), title: z.string().trim().min(2).max(180), isPublished: z.boolean(),
  contentType: z.enum(["text", "video", "material"]),
  text: z.string().trim().max(20000),
  videoUrl: z.string().trim().max(2000).refine((value) => {
    if (!value) return true;
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
  }, "Video links must use HTTPS without embedded credentials."),
  materialId: z.uuid().nullable(),
}).strict().superRefine((lesson, context) => {
  if (!lesson.isPublished) return;
  if (lesson.contentType === "text" && !lesson.text) context.addIssue({ code: "custom", path: ["text"], message: "Published text lessons need content." });
  if (lesson.contentType === "video" && !lesson.videoUrl) context.addIssue({ code: "custom", path: ["videoUrl"], message: "Published video lessons need an HTTPS link." });
  if (lesson.contentType === "material" && !lesson.materialId) context.addIssue({ code: "custom", path: ["materialId"], message: "Published download lessons need a course material." });
});
export const curriculumModuleSchema = z.object({ id: z.uuid(), title: z.string().trim().min(2).max(180), isPublished: z.boolean(), lessons: z.array(lessonSchema).max(100) }).strict();
export const curriculumSchema = z.object({ courseId: z.uuid(), updatedAt: z.iso.datetime(), modules: z.array(curriculumModuleSchema).max(50) }).strict().superRefine((value, context) => {
  const ids = value.modules.flatMap((module) => [module.id, ...module.lessons.map((lesson) => lesson.id)]);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Module and lesson identifiers must be unique." });
  if (value.modules.reduce((sum, module) => sum + module.lessons.length, 0) > 200) context.addIssue({ code: "custom", message: "A course supports up to 200 lessons." });
});
export type CurriculumLesson = z.infer<typeof lessonSchema>;
export type CurriculumModule = z.infer<typeof curriculumModuleSchema>;
export type CurriculumSnapshot = { course: { id: string; title: string; updatedAt: string }; modules: CurriculumModule[]; materials: { id: string; title: string }[] };
export const newLesson = (): CurriculumLesson => ({ id: crypto.randomUUID(), title: "New lesson", contentType: "text", text: "", videoUrl: "", materialId: null, isPublished: false });
export const newModule = (): CurriculumModule => ({ id: crypto.randomUUID(), title: "New module", isPublished: false, lessons: [] });
