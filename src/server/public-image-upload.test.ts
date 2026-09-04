import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ audits: [] as Record<string, unknown>[], failAudit: false }));

vi.mock("@/server/admin-auth", async (original) => {
  const actual = await original<typeof import("@/server/admin-auth")>();
  return {
    ...actual,
    requireClientAdmin: async (request: Request) => {
      if (request.headers.get("x-fixture-admin") !== "yes") throw new actual.AdminAuthError(401, "Sign in is required.");
      return { session: { user: { id: "image-admin" } }, profile: { id: "profile", role: "client_admin", active: true } };
    },
  };
});

vi.mock("@/server/db", () => ({
  getDb: () => ({
    insert: () => ({
      values: async (values: Record<string, unknown>) => {
        if (fixture.failAudit) throw new Error("audit failure");
        fixture.audits.push(values);
      },
    }),
  }),
}));

import { POST } from "@/app/api/admin/images/route";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
let storage = "";

function request(origin = "http://localhost:3001", admin = "yes", duplicate = false) {
  const form = new FormData();
  form.set("file", new File([png], "brand.png", { type: "image/png" }));
  if (duplicate) form.append("file", new File([png], "second.png", { type: "image/png" }));
  return new Request("http://localhost:3001/api/admin/images", { method: "POST", headers: { origin, "x-fixture-admin": admin }, body: form });
}

beforeEach(async () => {
  const parent = path.join(process.cwd(), "storage");
  await mkdir(parent, { recursive: true });
  storage = await mkdtemp(path.join(parent, "public-route-test-"));
  vi.stubEnv("PUBLIC_IMAGE_STORAGE_DIR", storage);
  fixture.audits = [];
  fixture.failAudit = false;
});

afterEach(async () => {
  if (storage) {
    const resolved = path.resolve(storage);
    if (!resolved.startsWith(path.join(process.cwd(), "storage", "public-route-test-"))) throw new Error("Unsafe fixture cleanup path.");
    await rm(resolved, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

it("requires an administrator and same-origin upload with one file", async () => {
  expect((await POST(request(undefined, "no"))).status).toBe(401);
  expect((await POST(request("https://untrusted.example"))).status).toBe(403);
  expect((await POST(request(undefined, "yes", true))).status).toBe(422);
  expect(await readdir(storage)).toEqual([]);
});

it("returns only a public URL, records an audit and discards a file if auditing fails", async () => {
  const response = await POST(request());
  expect(response.status).toBe(201);
  const result = await response.json();
  expect(result.data.url).toMatch(/^\/api\/images\/[a-f0-9-]{36}\.png$/);
  expect(result.data).not.toHaveProperty("filename");
  expect(fixture.audits).toHaveLength(1);
  expect(fixture.audits[0]).toMatchObject({ action: "public_image.uploaded", actorAuthUserId: "image-admin" });
  expect(await readdir(storage)).toHaveLength(1);

  await rm(storage, { recursive: true, force: true });
  await mkdir(storage, { recursive: true });
  fixture.failAudit = true;
  expect((await POST(request())).status).toBe(500);
  expect(await readdir(storage)).toEqual([]);
});
