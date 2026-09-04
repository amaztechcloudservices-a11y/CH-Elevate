import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { newBookingEvent } from "@/lib/booking-events";
let database: ReturnType<typeof drizzle>;
vi.mock("@/server/db", () => ({ getDb: () => database }));
vi.mock("@/server/booking-mail", () => ({ enqueueBookingMail: vi.fn(async () => []), dispatchBookingMail: vi.fn(async () => []) }));
vi.mock("@/server/admin-auth", async (original) => {
  const auth = await original<typeof import("@/server/admin-auth")>();
  return { ...auth, requireClientAdmin: async (request: Request) => { if (request.headers.get("x-fixture-admin") !== "yes") throw new auth.AdminAuthError(403, "Administrator required."); return { session: { user: { id: "horizon-fixture" } } }; } };
});
import { POST as mutate, GET as list } from "@/app/api/admin/booking-events/route";
import { GET as availability } from "@/app/api/bookings/availability/route";
import { POST as book } from "@/app/api/bookings/route";
const enabled = process.env.BOOKING_DB_TESTS === "1"; const fixtureSchema = `booking_horizon_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool; let setupPool: Pool;
const adminRequest = (data?: object) => new Request("http://localhost:3001/api/admin/booking-events", { method: data ? "POST" : "GET", headers: { origin: "http://localhost:3001", "x-fixture-admin": "yes" }, ...(data ? { body: JSON.stringify(data) } : {}) });
const slots = async (eventId: string, date: string) => { const response = await availability(new Request(`http://localhost:3001/api/bookings/availability?eventId=${eventId}&date=${date}`)); expect(response.status).toBe(200); return (await response.json()).slots as { value: string; startsAt: string }[]; };
const input = (eventId: string, date: string) => new Request("http://localhost:3001/api/bookings", { method: "POST", body: JSON.stringify({ eventId, date, time: "09:00", name: "Fixture Client", email: "fixture@example.test", phone: "8765550100", consent: true }) });
beforeAll(async () => {
  if (!enabled) return;
  process.loadEnvFile(".env.local"); const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web" || !/^booking_horizon_test_[a-f0-9]{32}$/.test(fixtureSchema)) throw new Error("Verified local fixture database required.");
  setupPool = new Pool({ connectionString: url.href }); await setupPool.query(`create schema "${fixtureSchema}"`);
  for (const table of ["booking_events", "appointments", "booking_blocks", "audit_logs"]) await setupPool.query(`create table "${fixtureSchema}"."${table}" (like public."${table}" including all)`);
  pool = new Pool({ connectionString: url.href, options: `-c search_path=${fixtureSchema},public` }); database = drizzle(pool);
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2028-01-31T15:00:00Z"));
});
afterAll(async () => { vi.useRealTimers(); if (pool) await pool.end(); if (setupPool) { await setupPool.query(`drop schema "${fixtureSchema}" cascade`); await setupPool.end(); } });
it.skipIf(!enabled)("persists every horizon and enforces inclusive boundaries in availability and booking writes", async () => {
  for (const [unit, end, beyond] of [["days", "2028-02-02", "2028-02-03"], ["weeks", "2028-02-14", "2028-02-15"], ["months", "2028-03-31", "2028-04-01"], ["years", "2030-01-31", "2030-02-01"], ["infinite", "2099-01-01", "2099-01-02"]] as const) {
    const data = { ...newBookingEvent, title: "Horizon fixture", slug: `horizon-${unit}`, description: "A local test booking event.", agentName: "Fixture", agentPhoto: "/images/test.jpg", leadTimeHours: 0, isPublished: true, horizon: { unit, count: 2 }, weekly: newBookingEvent.weekly.map((day) => ({ ...day, enabled: true, windows: [{ start: "09:00", end: "10:00" }] })) };
    const created = await mutate(adminRequest({ action: "create", data })); expect(created.status).toBe(201); const event = (await created.json()).data;
    expect((await (await list(adminRequest())).json()).data.find((row: { id: string }) => row.id === event.id).data.horizon).toEqual(data.horizon);
    expect((await slots(event.id, end)).map((slot) => slot.value)).toEqual(["09:00", "09:30"]);
    if (unit !== "infinite") {
      expect(await slots(event.id, beyond)).toEqual([]); expect((await book(input(event.id, beyond))).status).toBe(409);
      const override = await mutate(adminRequest({ action: "update", id: event.id, updatedAt: event.updatedAt, data: { ...data, dateOverrides: [{ date: beyond, windows: [{ start: "09:00", end: "10:00" }] }] } })); expect(override.status).toBe(200);
      expect(await slots(event.id, beyond)).toEqual([]);
    } else expect((await slots(event.id, beyond)).length).toBe(2);
    expect((await book(input(event.id, end))).status).toBe(201); expect((await slots(event.id, end)).map((slot) => slot.value)).toEqual(["09:30"]);
    expect((await book(input(event.id, end))).status).toBe(409);
  }
  expect((await pool.query("select count(*)::int as count from appointments")).rows[0].count).toBe(5);
});
