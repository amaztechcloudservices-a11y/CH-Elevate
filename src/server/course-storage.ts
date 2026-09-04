import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import path from "node:path";
import { randomUUID } from "node:crypto";

const allowedTypes: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain", ".csv": "text/csv",
};
export const maxCourseFileBytes = 25 * 1024 * 1024;

export class CourseFileError extends Error {}

export function validateCourseFile(file: File, bytes: Buffer) {
  const extension = path.extname(file.name).toLowerCase();
  if (!allowedTypes[extension] || file.type !== allowedTypes[extension]) throw new CourseFileError("The file extension and type must match: PDF, DOCX, XLSX, PPTX, TXT or CSV.");
  if (!bytes.length || bytes.length > maxCourseFileBytes) throw new CourseFileError("Files must be between 1 byte and 25 MB.");
  if (extension === ".pdf") {
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new CourseFileError("Choose a valid PDF file.");
  } else if ([".txt", ".csv"].includes(extension)) {
    try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new CourseFileError("Text and CSV files must use UTF-8 encoding."); }
    if (bytes.includes(0)) throw new CourseFileError("Text files cannot contain binary data.");
  } else {
    // Inspect the ZIP directory without extracting or decompressing untrusted content.
    const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (end < 0 || end + 22 > bytes.length || bytes.readUInt16LE(end + 4) !== 0 || bytes.readUInt16LE(end + 6) !== 0) throw new CourseFileError("Choose a valid Office document.");
    const count = bytes.readUInt16LE(end + 10);
    let offset = bytes.readUInt32LE(end + 16);
    const names = new Set<string>();
    if (!count || count > 10000 || offset + bytes.readUInt32LE(end + 12) !== end) throw new CourseFileError("Unsupported Office document container.");
    for (let i = 0; i < count; i++) {
      if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50 || (bytes.readUInt16LE(offset + 8) & 1)) throw new CourseFileError("Encrypted or invalid Office documents are not supported.");
      const length = bytes.readUInt16LE(offset + 28);
      const next = offset + 46 + length + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
      if (next > end) throw new CourseFileError("Invalid Office document directory.");
      const name = bytes.subarray(offset + 46, offset + 46 + length).toString("utf8");
      if (/vbaproject\.bin$/i.test(name)) throw new CourseFileError("Macro-enabled documents are not allowed.");
      names.add(name); offset = next;
    }
    const main = { ".docx": "word/document.xml", ".xlsx": "xl/workbook.xml", ".pptx": "ppt/presentation.xml" }[extension];
    if (offset !== end || !names.has("[Content_Types].xml") || !main || !names.has(main)) throw new CourseFileError("The Office document does not match its file type.");
  }
  return extension;
}

function rootDirectory() {
  const configured = process.env.COURSE_STORAGE_DIR;
  return configured
    ? path.resolve(/* turbopackIgnore: true */ configured)
    : path.join(process.cwd(), "storage", "course-portal");
}

export async function savePrivateFile(file: File, category: "materials" | "invoices") {
  if (file.size <= 0 || file.size > maxCourseFileBytes) throw new CourseFileError("Files must be between 1 byte and 25 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const extension = validateCourseFile(file, bytes);
  const storageKey = `${category}/${randomUUID()}${extension}`;
  const target = path.join(rootDirectory(), storageKey);
  if (!target.startsWith(rootDirectory() + path.sep)) throw new Error("Invalid storage path.");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
  return { storageKey, originalFilename: path.basename(file.name.replaceAll("\\", "/")).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 240), mimeType: file.type, sizeBytes: file.size };
}

// Only freshly generated upload keys may be removed when a database write rolls back.
export async function discardPrivateUpload(storageKey: string) {
  if (!/^(materials|invoices)\/[a-f0-9-]{36}\.(pdf|docx|xlsx|pptx|txt|csv)$/.test(storageKey)) throw new Error("Invalid upload key.");
  await unlink(path.join(rootDirectory(), storageKey)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
}

export async function privateFileResponse(storageKey: string, filename: string, mimeType: string) {
  const target = path.resolve(rootDirectory(), storageKey);
  if (!target.startsWith(rootDirectory() + path.sep)) return new Response("Not found", { status: 404 });
  const details = await stat(target).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT" || error.code === "ENOTDIR") return null; throw error; });
  if (!details?.isFile()) return new Response("Not found", { status: 404 });
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
