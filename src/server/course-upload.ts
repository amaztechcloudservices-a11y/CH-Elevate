import { CourseFileError, maxCourseFileBytes } from "./course-storage";

export async function readCourseUpload(request: Request, maxFileBytes = maxCourseFileBytes) {
  const limit = maxFileBytes + 64 * 1024;
  const limitMessage = `The upload exceeds the ${maxFileBytes / (1024 * 1024)} MB file limit.`;
  if (Number(request.headers.get("content-length")) > limit) throw new CourseFileError(limitMessage);
  const reader = request.body?.getReader();
  if (!reader) throw new CourseFileError("Choose a file.");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new CourseFileError(limitMessage); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return await new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData(); }
  catch { throw new CourseFileError("Invalid upload form."); }
}
