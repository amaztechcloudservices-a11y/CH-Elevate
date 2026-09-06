import { beforeEach, expect, it, vi } from "vitest";

const execute = vi.fn();
const storage = vi.fn();
vi.mock("@/server/db", () => ({ getDb: () => ({ execute }) }));
vi.mock("@/server/course-storage", () => ({ getCourseStorageStatus: () => storage() }));
vi.mock("@/server/site-mail", () => ({ getSiteMailConfig: () => ({ smtpUrl: "smtp://configured" }) }));
import { GET } from "@/app/api/ready/route";

beforeEach(() => { execute.mockReset(); storage.mockReset(); });

it("reports ready only when required dependencies are available", async () => {
  execute.mockResolvedValueOnce([]); storage.mockResolvedValueOnce({ ready: true, reason: "Ready." });
  const ready = await GET();
  expect(ready.status).toBe(200);
  expect((await ready.json()).checks).toMatchObject({ database: { ready: true }, storage: { ready: true }, email: { ready: true, configured: true, reachable: null, reason: "SMTP is configured; live connectivity is checked in System Settings." } });

  execute.mockRejectedValueOnce(new Error("offline")); storage.mockResolvedValueOnce({ ready: true, reason: "Ready." });
  const unavailable = await GET();
  expect(unavailable.status).toBe(503);
  expect((await unavailable.json()).checks.database.ready).toBe(false);
});
