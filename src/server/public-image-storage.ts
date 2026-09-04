import { createReadStream } from "node:fs";
import { mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import path from "node:path";

export const maxPublicImageBytes = 5 * 1024 * 1024;

type PublicImageType = {
  extension: ".jpg" | ".png" | ".webp";
  mimeType: "image/jpeg" | "image/png" | "image/webp";
};

const imageTypes: Record<PublicImageType["mimeType"], PublicImageType> = {
  "image/jpeg": { extension: ".jpg", mimeType: "image/jpeg" },
  "image/png": { extension: ".png", mimeType: "image/png" },
  "image/webp": { extension: ".webp", mimeType: "image/webp" },
};

const publicImageName = /^[a-f0-9-]{36}\.(?:jpg|png|webp)$/;

export class PublicImageError extends Error {}

function storageRoot() {
  const configured = process.env.PUBLIC_IMAGE_STORAGE_DIR;
  return configured
    ? path.resolve(/* turbopackIgnore: true */ configured)
    : path.join(process.cwd(), "storage", "public-images");
}

function detectImageType(bytes: Buffer): PublicImageType | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return imageTypes["image/png"];
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return imageTypes["image/jpeg"];
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return imageTypes["image/webp"];
  }
  return null;
}

export function validatePublicImage(file: File, bytes: Buffer) {
  if (!bytes.length || bytes.length > maxPublicImageBytes) {
    throw new PublicImageError("Images must be between 1 byte and 5 MB.");
  }
  const detected = detectImageType(bytes);
  if (!detected || file.type !== detected.mimeType) {
    throw new PublicImageError("Choose a valid PNG, JPEG or WebP image.");
  }
  return detected;
}

export async function readPublicImageUpload(request: Request) {
  const envelopeLimit = maxPublicImageBytes + 64 * 1024;
  const sizeMessage = "The upload exceeds the 5 MB image limit.";
  if (Number(request.headers.get("content-length")) > envelopeLimit) throw new PublicImageError(sizeMessage);
  const reader = request.body?.getReader();
  if (!reader) throw new PublicImageError("Choose an image from your device.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > envelopeLimit) {
        await reader.cancel();
        throw new PublicImageError(sizeMessage);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
  } catch (error) {
    if (error instanceof PublicImageError) throw error;
    throw new PublicImageError("Invalid image upload form.");
  }
}

export async function savePublicImage(file: File) {
  if (file.size <= 0 || file.size > maxPublicImageBytes) {
    throw new PublicImageError("Images must be between 1 byte and 5 MB.");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = validatePublicImage(file, bytes);
  const filename = `${randomUUID()}${type.extension}`;
  const root = storageRoot();
  const target = path.join(/* turbopackIgnore: true */ root, filename);
  if (!target.startsWith(root + path.sep)) throw new Error("Invalid image storage path.");
  await mkdir(root, { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
  return { filename, mimeType: type.mimeType, sizeBytes: bytes.length, url: `/api/images/${filename}` };
}

export async function discardPublicImage(filename: string) {
  if (!publicImageName.test(filename)) throw new Error("Invalid public image name.");
  await unlink(path.join(/* turbopackIgnore: true */ storageRoot(), filename)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

export async function publicImageResponse(filename: string, method: "GET" | "HEAD" = "GET") {
  if (!publicImageName.test(filename)) return new Response("Not found", { status: 404 });
  const root = storageRoot();
  const target = path.resolve(/* turbopackIgnore: true */ root, filename);
  if (!target.startsWith(root + path.sep)) return new Response("Not found", { status: 404 });
  const details = await stat(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  });
  if (!details?.isFile()) return new Response("Not found", { status: 404 });
  const extension = path.extname(filename);
  const mimeType = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
  return new Response(method === "HEAD" ? null : Readable.toWeb(createReadStream(target)) as ReadableStream, {
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(details.size),
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
