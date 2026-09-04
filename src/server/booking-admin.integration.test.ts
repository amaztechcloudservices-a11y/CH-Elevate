import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { newBookingEvent } from "@/lib/booking-events";

let database: ReturnType<typeof drizzle>;
const actor = `booking-admin-fixture-${randomUUID()}`;
vi.mock("@/server/db", () => ({ getDb: () => database }));
vi.mock("@/server/booking-mail", async (original) => ({ ...await original<typeof import("@/server/booking-mail")>(), dispatchBookingMail: vi.fn(async () => [{ state: "accepted" }]) }));
vi.mock("@/server/admin-auth", async (original) => {
  const originalModule = await original<typeof import("@/server/admin-auth")>();
  return { ...originalModule, requireClientAdmin: async (request: Request) => {
    if (request.headers.get("x-fixture-admin") !== "yes") throw new originalModule.AdminAuthError(403, "Administrator required.");
    return { session: { user: { id: actor } } };
  } };
});
import { PATCH as mutate, GET as list } from "@/app/api/admin/bookings/route";
import { GET as calendar } from "@/app/api/admin/bookings/calendar/route";
import { POST as book } from "@/app/api/bookings/route";
import { GET as availability } from "@/app/api/bookings/availability/route";

const enabled = process.env.BOOKING_DB_TESTS === "1";
let pool: Pool;
const eventId = randomUUID();
const blockId = randomUUID();
const suffix = randomUUID();
const date = "2094-09-04";
const eventData = { ...newBookingEvent, title: `Fixture ${suffix}`, slug: `fixture-${suffix}`, description: "Isolated calendar regression fixture.", agentName: "Test Agent", agentPhoto: "/images/test-agent.jpg", leadTimeHours: 0, isPublished: true, horizon: { unit: "infinite" as const, count: 1 }, weekly: newBookingEvent.weekly.map((day) => ({ ...day, enabled: true })) };
const admin = (path: string, body?: object, origin = "http://localhost:3001") => new Request(`http://localhost:3001/api/admin/bookings${path}`, { method: body ? "PATCH" : "GET", headers: { origin, "x-fixture-admin": "yes", "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
const slots = async () => (await (await availability(new Request(`http://localhost:3001/api/bookings/availability?eventId=${eventId}&date=${date}`))).json()).slots as { value: string }[];
const current = async (id: string) => {
  const { rows } = await pool.query("select updated_at from appointments where id=$1 and booking_event_id=$2", [id, eventId]);
  return { id, updatedAt: rows[0].updated_at.toISOString() };
};
beforeAll(async () => {
  if (!enabled) return;
  process.loadEnvFile(".env.local");
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web") throw new Error("Test requires the local fixture database.");
  pool = new Pool({ connectionString: process.env.DATABASE_URL }); database = drizzle(pool);
  await pool.query("insert into booking_events(id,slug,data) values($1,$2,$3)", [eventId, eventData.slug, eventData]);
});
afterAll(async () => {
  if (!pool) return;
  await pool.query("delete from appointments where booking_event_id=$1", [eventId]);
  await pool.query("delete from booking_blocks where id=$1", [blockId]);
  await pool.query("delete from audit_logs where actor_auth_user_id=$1", [actor]);
  await pool.query("delete from booking_events where id=$1", [eventId]);
  await pool.end();
});
it.skipIf(!enabled)("persists safe request transitions, restore, reschedule and concurrent reservations", async () => {
  expect((await mutate(new Request("http://localhost:3001/api/admin/bookings", { method: "PATCH", body: "{}" }))).status).toBe(403);
  expect((await mutate(admin("", {}, "https://untrusted.example"))).status).toBe(403);
  expect((await mutate(admin("", { action: "delete", id: eventId }))).status).toBe(422);
  expect((await mutate(admin("", { action: "delete", id: randomUUID(), updatedAt: new Date().toISOString() }))).status).toBe(404);
  const input = { eventId, date, time: "09:00", name: "Calendar Fixture", email: "fixture@example.test", phone: "8765550100", consent: true };
  const publicRequest = (time: string) => new Request("http://localhost:3001/api/bookings", { method: "POST", body: JSON.stringify({ ...input, time }) });
  const response = await book(publicRequest("09:00"));
  expect(response.status).toBe(201);
  const id = (await response.json()).booking.id;
  expect((await slots()).some((slot) => slot.value === "09:00")).toBe(false);
  const stale = await current(id);
  expect((await mutate(admin("", { action: "status", ...stale, status: "rejected" }))).status).toBe(200);
  expect((await slots()).some((slot) => slot.value === "09:00")).toBe(true);
  expect((await mutate(admin("", { action: "status", ...stale, status: "confirmed" }))).status).toBe(409);
  const competitorResponse = await book(publicRequest("09:00"));
  expect(competitorResponse.status).toBe(201);
  const competitor = (await competitorResponse.json()).booking.id;
  expect((await mutate(admin("", { action: "status", ...await current(id), status: "confirmed" }))).status).toBe(409);
  expect((await mutate(admin("", { action: "delete", ...await current(competitor) }))).status).toBe(200);
  expect((await mutate(admin("", { action: "status", ...await current(id), status: "confirmed" }))).status).toBe(200);
  expect((await mutate(admin("", { action: "restore", ...await current(competitor) }))).status).toBe(409);
  expect((await mutate(admin("", { action: "status", ...await current(competitor), status: "pending" }))).status).toBe(409);
  expect((await mutate(admin("", { action: "edit", ...await current(id), customerName: "Edited fixture", customerEmail: "fixture@example.test", customerPhone: "8765550100", company: "Fixture", notes: "Private admin note" }))).status).toBe(200);
  expect((await mutate(admin("", { action: "reschedule", ...await current(id), date, time: "10:00", durationMinutes: 45 }))).status).toBe(200);
  expect((await slots()).some((slot) => slot.value === "09:00")).toBe(true);
  expect((await mutate(admin("", { action: "restore", ...await current(competitor) }))).status).toBe(200);
  const originalVersion = await current(id);
  const simultaneous = await Promise.all([
    mutate(admin("", { action: "duplicate", ...originalVersion, date, time: "11:00", durationMinutes: 30 })),
    book(publicRequest("11:00")),
  ]);
  expect(simultaneous.map((res) => res.status).sort()).toEqual([201, 409]);
  await pool.query("insert into booking_blocks(id,starts_at,ends_at,reason) values($1,'2094-09-04T18:00:00Z','2094-09-04T18:30:00Z','Isolated test block')", [blockId]);
  expect((await mutate(admin("", { action: "reschedule", ...await current(id), date, time: "13:00", durationMinutes: 30 }))).status).toBe(409);
  expect((await slots()).some((slot) => slot.value === "13:00")).toBe(false);
  const stored = (await pool.query("select status,notes,questionnaire, extract(epoch from (ends_at-starts_at))/60 as duration from appointments where id=$1", [id])).rows[0];
  expect(stored.status).toBe("pending"); expect(stored.notes).toBe("Private admin note"); expect(Number(stored.duration)).toBe(45); expect(stored.questionnaire.consent).toBe(true);
  const month = await calendar(admin(`/calendar?month=2094-09&eventId=${eventId}`));
  expect(month.status).toBe(200);
  const data = (await month.json()).data;
  expect(data.days).toHaveLength(30);
  expect(data.bookings.some((row: { id: string }) => row.id === id)).toBe(true);
  expect(data.days.find((day: { date: string }) => day.date === date).slots.some((slot: { value: string }) => slot.value === "10:00")).toBe(false);
  const audit = await pool.query("select action from audit_logs where actor_auth_user_id=$1", [actor]);
  expect(audit.rows.map((row: { action: string }) => row.action)).toContain("booking.appointment_restore");
}, 30000);
it.skipIf(!enabled)("paginates beyond the former 250-record cutoff and keeps deleted records separate", async () => {
  const search = `pagination-${suffix}`;
  await pool.query("insert into appointments (booking_event_id,service,customer_name,customer_email,starts_at,ends_at,time_zone,status) select $1,$2,$2,'fixture@example.test',t,t+interval '30 minutes','America/Jamaica','rejected' from generate_series('2095-01-01'::timestamptz,'2095-09-08'::timestamptz,interval '1 day') t", [eventId, search]);
  const first = (await (await list(admin(`?search=${search}`))).json());
  expect(first.total).toBe(251); expect(first.data).toHaveLength(50);
  const last = (await (await list(admin(`?search=${search}&page=6`))).json());
  expect(last.data).toHaveLength(1);
  const target = first.data[0];
  expect((await mutate(admin("", { action: "delete", id: target.id, updatedAt: target.updatedAt }))).status).toBe(200);
  expect((await (await list(admin(`?search=${search}`))).json()).total).toBe(250);
  const deleted = (await (await list(admin(`?search=${search}&deleted=true`))).json());
  expect(deleted.total).toBe(1); expect(deleted.data[0].id).toBe(target.id);
}, 30000);
