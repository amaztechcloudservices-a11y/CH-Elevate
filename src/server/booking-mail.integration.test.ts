import { randomUUID } from "node:crypto";
import { createServer, type Socket } from "node:net";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { defaultBookingMailSettings } from "@/lib/booking-mail";
import { newBookingEvent } from "@/lib/booking-events";

let database: ReturnType<typeof drizzle>;
const actor = `mail-fixture-${randomUUID()}`;
vi.mock("@/server/db", () => ({ getDb: () => database }));
vi.mock("@/server/admin-auth", async (original) => {
  const originalModule = await original<typeof import("@/server/admin-auth")>();
  return { ...originalModule, requireClientAdmin: async (request: Request) => {
    if (request.headers.get("x-fixture-admin") !== "yes") throw new originalModule.AdminAuthError(403, "Administrator required.");
    return { session: { user: { id: actor, email: "admin@example.test" } } };
  } };
});
import { POST as configure, GET as settings } from "@/app/api/admin/booking-emails/route";
import { POST as book } from "@/app/api/bookings/route";
import { PATCH as changeBooking } from "@/app/api/admin/bookings/route";
import { deliverBookingMail } from "@/server/booking-mail";

const enabled = process.env.BOOKING_DB_TESTS === "1";
const schema = `booking_mail_test_${randomUUID().replaceAll("-", "")}`;
const eventId = randomUUID();
let pool: Pool; let setupPool: Pool; let smtpUrl = "";
let disconnectAfterData = false;
const messages: string[] = [];
const sockets = new Set<Socket>();
// Task-owned loopback SMTP sink. It accepts messages into memory and never relays them.
const smtp = createServer((socket) => {
  sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => {});
  socket.write("220 localhost fixture SMTP\r\n");
  let buffer = ""; let readingData = false; let content = "";
  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    while (buffer.includes("\r\n")) {
      const index = buffer.indexOf("\r\n"); const line = buffer.slice(0, index); buffer = buffer.slice(index + 2);
      if (readingData) {
        if (line === ".") { messages.push(content); content = ""; readingData = false; if (disconnectAfterData) socket.destroy(); else socket.write("250 accepted by fixture\r\n"); }
        else content += `${line}\r\n`;
      } else if (/^(EHLO|HELO)/.test(line)) socket.write("250-localhost\r\n250 SIZE 1048576\r\n");
      else if (/^(MAIL FROM|RCPT TO|RSET)/.test(line)) socket.write("250 OK\r\n");
      else if (line === "DATA") { readingData = true; socket.write("354 send data\r\n"); }
      else if (line === "QUIT") socket.end("221 goodbye\r\n");
      else socket.write("250 OK\r\n");
    }
  });
});
const admin = (body?: object, path = "/api/admin/booking-emails", origin = "http://localhost:3001") => new Request(`http://localhost:3001${path}`, { method: body ? path.endsWith("bookings") ? "PATCH" : "POST" : "GET", headers: { origin, "x-fixture-admin": "yes", "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
const current = async (id: string) => ({ id, updatedAt: (await pool.query("select updated_at from appointments where id=$1 and booking_event_id=$2", [id, eventId])).rows[0].updated_at.toISOString() });
const reserve = (time: string) => book(new Request("http://localhost:3001/api/bookings", { method: "POST", body: JSON.stringify({ eventId, date: "2097-09-04", time, name: "Local Mail Client", email: "client@example.test", phone: "8765550100", consent: true }) }));
beforeAll(async () => {
  if (!enabled) return;
  process.loadEnvFile(".env.local");
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web" || !/^booking_mail_test_[a-f0-9]{32}$/.test(schema)) throw new Error("Verified local fixtures required.");
  await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", resolve));
  const address = smtp.address(); if (!address || typeof address === "string" || address.address !== "127.0.0.1") throw new Error("SMTP must be loopback only.");
  smtpUrl = `smtp://127.0.0.1:${address.port}?ignoreTLS=true`; vi.stubEnv("SMTP_URL", smtpUrl);
  setupPool = new Pool({ connectionString: process.env.DATABASE_URL });
  await setupPool.query(`create schema "${schema}"`);
  // Shadow only the singleton configuration; the application's actual settings are never changed.
  await setupPool.query(`create table "${schema}".booking_email_settings (like public.booking_email_settings including all)`);
  pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` }); database = drizzle(pool);
  await pool.query("insert into booking_events(id,slug,data) values($1,$2,$3)", [eventId, `mail-fixture-${eventId}`, { ...newBookingEvent, title: "Mail Fixture", slug: `mail-fixture-${eventId}`, description: "Local SMTP capture verification fixture.", agentName: "Fixture Agent", agentPhoto: "/images/fixture.jpg", isPublished: true, leadTimeHours: 0, horizon: { unit: "infinite", count: 1 }, weekly: newBookingEvent.weekly.map((day) => ({ ...day, enabled: true })) }]);
});
afterAll(async () => {
  for (const socket of sockets) socket.destroy();
  if (smtp.listening) await new Promise<void>((resolve) => smtp.close(() => resolve()));
  if (pool) {
    await pool.query("delete from appointments where booking_event_id=$1", [eventId]);
    await pool.query("delete from booking_events where id=$1", [eventId]);
    await pool.query("delete from audit_logs where actor_auth_user_id=$1", [actor]);
    await pool.end();
  }
  if (setupPool) { await setupPool.query(`drop schema if exists "${schema}" cascade`); await setupPool.end(); }
  vi.unstubAllEnvs();
});
it.skipIf(!enabled)("persists protected settings and delivers configured request/approval templates through local SMTP", async () => {
  expect((await settings(new Request("http://localhost:3001/api/admin/booking-emails"))).status).toBe(403);
  expect((await configure(admin({}, "/api/admin/booking-emails", "https://untrusted.example"))).status).toBe(403);
  const original = await (await settings(admin())).json(); expect(original.updatedAt).toBeNull();
  const data = { ...defaultBookingMailSettings, senderName: "Fixture Sender", senderEmail: "sender@example.test", replyTo: "reply@example.test", adminRecipient: "inbox@example.test", templates: { ...defaultBookingMailSettings.templates, approved: { enabled: true, subject: "Confirmed: {{eventTitle}}", text: "Approval for {{customerName}} at {{time}}." } } };
  const saved = await configure(admin({ action: "save", data, updatedAt: null })); expect(saved.status).toBe(200);
  expect((await (await settings(admin())).json()).data).toEqual(data);
  expect((await configure(admin({ action: "save", data, updatedAt: null }))).status).toBe(409);
  expect((await configure(admin({ action: "test", kind: "approved", to: "unrelated@example.test" }))).status).toBe(422);
  const reserved = await reserve("09:00"); expect(reserved.status).toBe(201); const id = (await reserved.json()).booking.id;
  expect(messages).toHaveLength(2);
  expect(messages.some((text) => text.includes("To: client@example.test"))).toBe(true);
  expect(messages.some((text) => text.includes("To: inbox@example.test"))).toBe(true);
  expect(messages[0]).toContain("From: Fixture Sender <sender@example.test>");
  const result = await changeBooking(admin({ action: "status", ...await current(id), status: "confirmed", notifyCustomer: true }, "/api/admin/bookings"));
  expect(result.status).toBe(200); expect((await result.json()).notifications).toEqual([{ state: "accepted" }]);
  expect(messages.at(-1)).toContain("Subject: Confirmed: Mail Fixture");
  expect(messages.at(-1)).toContain("Approval for Local Mail Client");
  const delivered = (await pool.query("select id from booking_mail_deliveries where booking_id=$1 and kind='approved'", [id])).rows[0].id;
  await deliverBookingMail(delivered); expect(messages).toHaveLength(3);
  const test = await configure(admin({ action: "test", kind: "approved" })); expect((await test.json()).result.state).toBe("accepted"); expect(messages.at(-1)).toContain("To: admin@example.test");
}, 30000);
it.skipIf(!enabled)("keeps bookings on failed mail, prevents outdated retries and makes uncertain duplicates explicit", async () => {
  vi.stubEnv("SMTP_URL", "");
  const reserved = await reserve("10:00"); expect(reserved.status).toBe(201); const id = (await reserved.json()).booking.id;
  const queued = (await pool.query("select id,kind,state from booking_mail_deliveries where booking_id=$1", [id])).rows;
  expect(queued.map((row: { state: string }) => row.state)).toEqual(["failed", "failed"]);
  vi.stubEnv("SMTP_URL", smtpUrl);
  const received = queued.find((row: { kind: string }) => row.kind === "received").id;
  expect((await deliverBookingMail(received)).state).toBe("accepted");
  await changeBooking(admin({ action: "edit", ...await current(id), customerName: "Local Mail Client", customerEmail: "client@example.test", customerPhone: "8765550100", company: "", notes: "Edited after email failure" }, "/api/admin/bookings"));
  const beforeStale = messages.length;
  expect((await deliverBookingMail(queued.find((row: { kind: string }) => row.kind === "adminNew").id)).state).toBe("superseded"); expect(messages).toHaveLength(beforeStale);
  disconnectAfterData = true;
  const response = await changeBooking(admin({ action: "status", ...await current(id), status: "confirmed", notifyCustomer: true }, "/api/admin/bookings"));
  expect(response.status).toBe(200); expect((await response.json()).notifications[0].state).toBe("unknown");
  const uncertain = (await pool.query("select id from booking_mail_deliveries where booking_id=$1 and kind='approved'", [id])).rows[0].id;
  const beforeRetry = messages.length;
  expect((await deliverBookingMail(uncertain)).state).toBe("unknown"); expect(messages).toHaveLength(beforeRetry);
  disconnectAfterData = false;
  expect((await deliverBookingMail(uncertain, true)).state).toBe("accepted"); expect(messages).toHaveLength(beforeRetry + 1);
}, 30000);
