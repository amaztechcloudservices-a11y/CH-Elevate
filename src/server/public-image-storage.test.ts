import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  PublicImageError,
  discardPublicImage,
  publicImageResponse,
  readPublicImageUpload,
  savePublicImage,
  validatePublicImage,
} from "./public-image-storage";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
let storage = "";

beforeEach(async () => {
  const parent = path.join(process.cwd(), "storage");
  await mkdir(parent, { recursive: true });
  storage = await mkdtemp(path.join(parent, "public-image-test-"));
  vi.stubEnv("PUBLIC_IMAGE_STORAGE_DIR", storage);
});

afterEach(async () => {
  if (storage) {
    const resolved = path.resolve(storage);
    if (!resolved.startsWith(path.join(process.cwd(), "storage", "public-image-test-"))) throw new Error("Unsafe fixture cleanup path.");
    await rm(resolved, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

it("stores a validated image under a generated public name and serves it safely", async () => {
  const saved = await savePublicImage(new File([png], "brand.png", { type: "image/png" }));
  expect(saved.url).toMatch(/^\/api\/images\/[a-f0-9-]{36}\.png$/);
  expect(await readdir(storage)).toEqual([saved.filename]);
  const response = await publicImageResponse(saved.filename);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("cache-control")).toContain("immutable");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
  const head = await publicImageResponse(saved.filename, "HEAD");
  expect(head.status).toBe(200);
  expect(await head.text()).toBe("");
  await discardPublicImage(saved.filename);
  expect(await readdir(storage)).toEqual([]);
});

it("rejects disguised, active-content, empty and oversized image uploads", () => {
  expect(() => validatePublicImage(new File([png], "fake.jpg", { type: "image/jpeg" }), png)).toThrow(/valid PNG/);
  const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
  expect(() => validatePublicImage(new File([svg], "active.svg", { type: "image/svg+xml" }), svg)).toThrow(/valid PNG/);
  expect(() => validatePublicImage(new File([], "empty.png", { type: "image/png" }), Buffer.alloc(0))).toThrow(/1 byte/);
  expect(() => validatePublicImage(new File([Buffer.alloc(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }), Buffer.alloc(5 * 1024 * 1024 + 1))).toThrow(/5 MB/);
});

it("bounds multipart envelopes and rejects unsafe public names", async () => {
  const form = new FormData();
  form.set("file", new File([png], "brand.png", { type: "image/png" }));
  expect((await readPublicImageUpload(new Request("http://localhost/api/admin/images", { method: "POST", body: form }))).get("file")).toBeInstanceOf(File);
  await expect(readPublicImageUpload(new Request("http://localhost/api/admin/images", { method: "POST", body: new Uint8Array(6 * 1024 * 1024) }))).rejects.toBeInstanceOf(PublicImageError);
  expect((await publicImageResponse("../secret.png")).status).toBe(404);
  expect((await publicImageResponse("not-an-upload.png")).status).toBe(404);
});
