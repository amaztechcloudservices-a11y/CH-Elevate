import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { randomUUID } from "node:crypto";

const allowedTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
]);
const maxBytes = 25 * 1024 * 1024;

export class CourseFileError extends Error {}

function rootDirectory() {
  const configured = process.env.COURSE_STORAGE_DIR;
  return configured
    ? path.resolve(/* turbopackIgnore: true */ configured)
    : path.join(process.cwd(), "storage", "course-portal");
}

export async function savePrivateFile(file: File, category: "materials" | "invoices") {
  if (!allowedTypes.has(file.type)) throw new CourseFileError("This file type is not allowed.");
  if (file.size <= 0 || file.size > maxBytes) throw new CourseFileError("Files must be between 1 byte and 25 MB.");
  const extension = path.extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, "");
  const storageKey = `${category}/${randomUUID()}${extension}`;
  const target = path.join(rootDirectory(), storageKey);
  if (!target.startsWith(rootDirectory() + path.sep)) throw new Error("Invalid storage path.");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
  return { storageKey, originalFilename: path.basename(file.name), mimeType: file.type, sizeBytes: file.size };
}

export async function privateFileResponse(storageKey: string, filename: string, mimeType: string) {
  const target = path.resolve(rootDirectory(), storageKey);
  if (!target.startsWith(rootDirectory() + path.sep)) return new Response("Not found", { status: 404 });
  const details = await stat(target);
  return new Response(Readable.toWeb(createReadStream(target)) as ReadableStream, {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(details.size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
