import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { newBookingEvent } from "@/lib/booking-events";

let database: ReturnType<typeof drizzle>;
vi.mock("@/server/db", () => ({ getDb: () => database }));
vi.mock("@/server/booking-mail", async (original) => ({ ...await original<typeof import("@/server/booking-mail")>(), dispatchBookingMail: vi.fn(async () => [{ state: "accepted" }]) }));
vi.mock("@/server/admin-auth", async (original) => {
  const authModule = await original<typeof import("@/server/admin-auth")>();
  return { ...authModule, requireClientAdmin: async (request: Request) => {
    if (request.headers.get("x-fixture-admin") !== "yes") throw new authModule.AdminAuthError(403, "Administrator required.");
    return { session: { user: { id: "booking-event-test-actor" } } };
  } };
});
import { POST as mutate, GET as listAdmin } from "@/app/api/admin/booking-events/route";
import { GET as listPublic } from "@/app/api/bookings/events/route";
import { POST as book } from "@/app/api/bookings/route";
import { GET as availability } from "@/app/api/bookings/availability/route";
import { dispatchBookingMail } from "@/server/booking-mail";

const enabled = process.env.BOOKING_DB_TESTS === "1";
let pool: Pool;
const ids: string[] = [];
const suffix = randomUUID();
const eventData = { ...newBookingEvent, title: `Fixture ${suffix}`, slug: `fixture-${suffix}`, description: "Test booking event for database verification.", agentName: "Test Agent", agentPhoto: "/images/test-agent.jpg", leadTimeHours: 0, isPublished: true, horizon: { unit: "infinite" as const, count: 1 }, weekly: newBookingEvent.weekly.map((day) => ({ ...day, enabled: true })), questions: [{ id: "question_topic", label: "Topic", type: "text" as const, required: true, options: [] }] };
const adminRequest = (body?: object, admin = true) => new Request("http://localhost:3001/api/admin/booking-events", { method: body ? "POST" : "GET", headers: { origin: "http://localhost:3001", "x-fixture-admin": admin ? "yes" : "no", "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });

beforeAll(() => {
  if (!enabled) return;
  process.loadEnvFile(".env.local");
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web") throw new Error("Test requires the task-owned local PostgreSQL database.");
  pool = new Pool({ connectionString: process.env.DATABASE_URL }); database = drizzle(pool);
});
afterAll(async () => {
  if (!pool) return;
  // Remove only fixture-owned rows; never truncate shared tables.
  await pool.query("delete from appointments where booking_event_id = any($1::uuid[])", [ids]);
  await pool.query("delete from audit_logs where entity_id = any($1::text[]) and actor_auth_user_id = $2", [ids, "booking-event-test-actor"]);
  await pool.query("delete from booking_events where id = any($1::uuid[])", [ids]);
  await pool.end();
});
it.skipIf(!enabled)("persists event CRUD, publication, scheduling and conflict safety in PostgreSQL", async () => {
  expect((await listAdmin(adminRequest(undefined, false))).status).toBe(403);
  const created = await mutate(adminRequest({ action: "create", data: eventData }));
  const event = (await created.json()).data; ids.push(event.id);
  expect(created.status).toBe(201);
  const duplicateSlug = await mutate(adminRequest({ action: "create", data: eventData }));
  expect(duplicateSlug.status).toBe(409);
  expect((await (await listPublic()).json()).data.some((row: { id: string }) => row.id === event.id)).toBe(true);
  const listed = (await (await listAdmin(adminRequest())).json()).data.find((row: { id: string }) => row.id === event.id);
  expect(listed.data.durationMinutes).toBe(30);
  const copied = await mutate(adminRequest({ action: "duplicate", id: event.id }));
  expect(copied.status).toBe(201);
  const copy = (await copied.json()).data; ids.push(copy.id);
  expect(copy.data.isPublished).toBe(false);
  expect((await (await listPublic()).json()).data.some((row: { id: string }) => row.id === copy.id)).toBe(false);
  expect((await mutate(adminRequest({ action: "delete", id: copy.id }))).status).toBe(200);
  const updated = await mutate(adminRequest({ action: "update", id: event.id, updatedAt: event.updatedAt, data: { ...eventData, durationMinutes: 45 } }));
  expect(updated.status).toBe(200);
  expect((await mutate(adminRequest({ action: "update", id: event.id, updatedAt: event.updatedAt, data: eventData }))).status).toBe(409);
  const date = "2093-09-04";
  const available = await availability(new Request(`http://localhost:3001/api/bookings/availability?eventId=${event.id}&date=${date}`));
  expect(available.status).toBe(200);
  const slots = (await available.json()).slots;
  expect(slots.length).toBeGreaterThan(0);
  const input = { eventId: event.id, date, time: slots[0].value, name: "Test Client", email: "fixture@example.test", phone: "8765550100", company: "", consent: true, answers: { question_topic: "Test discussion" } };
  const request = (body: object) => new Request("http://localhost:3001/api/bookings", { method: "POST", body: JSON.stringify(body) });
  expect((await book(request({ ...input, answers: {} }))).status).toBe(400);
  expect((await book(request({ ...input, eventId: copy.id }))).status).toBe(404);
  const responses = await Promise.all([book(request(input)), book(request(input))]);
  expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
  const stored = await pool.query("select service, extract(epoch from (ends_at-starts_at))/60 as duration, questionnaire from appointments where booking_event_id=$1", [event.id]);
  expect(stored.rows.length).toBe(1);
  expect(Number(stored.rows[0].duration)).toBe(45);
  expect(stored.rows[0].questionnaire.question_topic).toBe("Test discussion");
  expect(vi.mocked(dispatchBookingMail)).toHaveBeenCalledTimes(1);
  expect((await mutate(adminRequest({ action: "delete", id: event.id }))).status).toBe(409);
  const after = await availability(new Request(`http://localhost:3001/api/bookings/availability?eventId=${event.id}&date=${date}`));
  expect((await after.json()).slots.some((slot: { value: string }) => slot.value === input.time)).toBe(false);
}, 30_000);
