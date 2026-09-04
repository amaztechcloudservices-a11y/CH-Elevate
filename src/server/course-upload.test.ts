import { expect, it } from "vitest";
import { readCourseUpload } from "./course-upload";
it("reads multipart uploads and rejects malformed or oversized envelopes", async () => {
  const form = new FormData(); form.set("title", "Course notes"); form.set("file", new File(["Notes"], "notes.txt", { type: "text/plain" }));
  const result = await readCourseUpload(new Request("http://localhost/upload", { method: "POST", body: form }));
  expect(result.get("title")).toBe("Course notes");
  await expect(readCourseUpload(new Request("http://localhost/upload", { method: "POST", body: "invalid" }))).rejects.toThrow(/Invalid upload/);
  await expect(readCourseUpload(new Request("http://localhost/upload", { method: "POST", body: "x", headers: { "content-length": String(26 * 1024 * 1024) } }))).rejects.toThrow(/25 MB/);
  await expect(readCourseUpload(new Request("http://localhost/upload", { method: "POST", body: new Uint8Array(26 * 1024 * 1024) }))).rejects.toThrow(/25 MB/);
  await expect(readCourseUpload(new Request("http://localhost/upload", { method: "POST", body: new Uint8Array(2 * 1024 * 1024) }), 1024 * 1024)).rejects.toThrow(/1 MB/);
});
