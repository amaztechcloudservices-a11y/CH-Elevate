import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Socket } from "node:net";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

let database: ReturnType<typeof drizzle>;
vi.mock("@/server/db", () => ({ getDb: () => database }));
import { getAuth } from "./auth";
import { POST } from "@/app/api/admin/courses/password-reset/route";

const enabled = process.env.BOOKING_DB_TESTS === "1";
const fixtureSchema = `student_reset_test_${randomUUID().replaceAll("-", "")}`;
const participantId = randomUUID();
const studentEmail = "student@example.test";
const oldPassword = randomBytes(24).toString("hex");
let pool: Pool; let setupPool: Pool; let adminCookie = ""; let studentCookie = ""; let studentId = "";
let smtpUrl = "";
const messages: string[] = [];
const sockets = new Set<Socket>();
// Memory-only SMTP capture, bound to loopback. No student email leaves the machine.
const smtp = createServer((socket) => {
  sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => {});
  socket.write("220 localhost test SMTP\r\n");
  let buffer = ""; let data = false; let content = "";
  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    while (buffer.includes("\r\n")) {
      const end = buffer.indexOf("\r\n"); const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
      if (data) {
        if (line === ".") { messages.push(content); content = ""; data = false; socket.write("250 accepted\r\n"); }
        else content += `${line}\r\n`;
      } else if (/^(EHLO|HELO)/.test(line)) socket.write("250-localhost\r\n250 SIZE 1048576\r\n");
      else if (line === "DATA") { data = true; socket.write("354 send data\r\n"); }
      else if (line === "QUIT") socket.end("221 goodbye\r\n");
      else socket.write("250 OK\r\n");
    }
  });
});
const request = (cookie = adminCookie, origin = "http://localhost:3001", body: object = { participantId }) => new Request("http://localhost:3001/api/admin/courses/password-reset", { method: "POST", headers: { cookie, origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeAll(async () => {
  if (!enabled) return;
  process.loadEnvFile(".env.local");
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web" || !/^student_reset_test_[a-f0-9]{32}$/.test(fixtureSchema)) throw new Error("Verified local fixture database required.");
  await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", resolve));
  const address = smtp.address(); if (!address || typeof address === "string" || address.address !== "127.0.0.1") throw new Error("Loopback SMTP required.");
  smtpUrl = `smtp://127.0.0.1:${address.port}?ignoreTLS=true`;
  vi.stubEnv("SMTP_URL", smtpUrl); vi.stubEnv("CONTACT_FROM", "Test Sender <sender@example.test>");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3001"); vi.stubEnv("BETTER_AUTH_SECRET", randomBytes(40).toString("hex")); vi.stubEnv("GOOGLE_CLIENT_ID", "");
  setupPool = new Pool({ connectionString: process.env.DATABASE_URL });
  await setupPool.query(`create schema "${fixtureSchema}"`);
  // Clone structure, not data. No public auth, registration, or audit rows are modified.
  for (const table of ["user", "session", "account", "verification", "profiles", "registration_participants", "audit_logs"]) {
    await setupPool.query(`create table "${fixtureSchema}"."${table}" (like public."${table}" including all)`);
  }
  pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${fixtureSchema},public` }); database = drizzle(pool);
  for (const email of ["admin@example.test", studentEmail]) {
    const response = await getAuth().api.signUpEmail({ body: { name: "Local Reset Fixture", email, password: oldPassword }, asResponse: true });
    if (response.status !== 200) throw new Error("Fixture account creation failed.");
    const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
    const id = (await response.json()).user.id;
    if (email === studentEmail) { studentCookie = cookie; studentId = id; }
    else { adminCookie = cookie; await pool.query("update profiles set role='client_admin' where auth_user_id=$1", [id]); }
  }
  await pool.query("insert into registration_participants(id,registration_id,offering_id,name,email,email_normalized) values($1,$2,$3,'Local Student',$4,$4)", [participantId, randomUUID(), randomUUID(), studentEmail]);
}, 30000);
afterAll(async () => {
  for (const socket of sockets) socket.destroy();
  if (smtp.listening) await new Promise<void>((resolve) => smtp.close(() => resolve()));
  if (pool) await pool.end();
  if (setupPool) { await setupPool.query(`drop schema if exists "${fixtureSchema}" cascade`); await setupPool.end(); }
  vi.unstubAllEnvs();
});

it.skipIf(!enabled)("enforces real sessions, role, origin, registered destination and database cooldown", async () => {
  expect((await POST(request(""))).status).toBe(401);
  expect((await POST(request(studentCookie))).status).toBe(403);
  expect((await POST(request(adminCookie, "https://untrusted.example"))).status).toBe(403);
  expect((await POST(request(adminCookie, undefined, { participantId, email: "unrelated@example.test" }))).status).toBe(422);
  await pool.query("update profiles set active=false where auth_user_id=$1", [studentId]);
  expect((await POST(request())).status).toBe(404);
  await pool.query("update profiles set active=true,role='staff' where auth_user_id=$1", [studentId]);
  expect((await POST(request())).status).toBe(404);
  await pool.query("update profiles set role='customer' where auth_user_id=$1", [studentId]);
  vi.stubEnv("SMTP_URL", ""); expect((await POST(request())).status).toBe(503); vi.stubEnv("SMTP_URL", smtpUrl);
  const responses = await Promise.all([POST(request()), POST(request())]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 429]);
  expect(messages).toHaveLength(1);
  expect(messages[0]).toContain("To: student@example.test");
  const audits = await pool.query("select action,entity_id,metadata from audit_logs");
  expect(audits.rows).toHaveLength(1);
  expect(audits.rows[0].action).toBe("course.student_password_reset_requested");
  expect(audits.rows[0].entity_id).toBe(studentId);
  expect(JSON.stringify(audits.rows)).not.toMatch(/reset-password|token|passwordHash/);
  expect((await POST(request())).status).toBe(429);
  const decoded = messages[0].replace(/=\r\n/g, "").replace(/=3D/g, "=");
  const link = decoded.split("\r\n").find((line) => line.startsWith("http://localhost:3001/api/auth/reset-password/"));
  if (!link) throw new Error("Captured reset link missing.");
  const url = new URL(link);
  const token = url.pathname.split("/").at(-1)!;
  expect(url.searchParams.get("callbackURL")).toBe("/portal/reset-password");
  const verification = (await pool.query("select expires_at from verification")).rows;
  expect(verification).toHaveLength(1);
  expect(verification[0].expires_at.getTime() - Date.now()).toBeGreaterThan(1_790_000);
  expect(verification[0].expires_at.getTime() - Date.now()).toBeLessThanOrEqual(1_800_000);
  const newPassword = randomBytes(24).toString("hex");
  await getAuth().api.resetPassword({ body: { token, newPassword } });
  expect((await pool.query("select id from session where user_id=$1", [studentId])).rows).toHaveLength(0);
  expect(await getAuth().api.getSession({ headers: new Headers({ cookie: studentCookie }) })).toBeNull();
  expect(await getAuth().api.resetPassword({ body: { token, newPassword: oldPassword } }).then(() => false, () => true)).toBe(true);
  expect(await getAuth().api.signInEmail({ body: { email: studentEmail, password: oldPassword } }).then(() => false, () => true)).toBe(true);
  expect(await getAuth().api.signInEmail({ body: { email: studentEmail, password: newPassword } }).then(() => true, () => false)).toBe(true);
  // Cooldown is stored in PostgreSQL, not a process-local timer.
  await pool.query("update audit_logs set created_at=now()-interval '61 seconds' where entity_id=$1", [studentId]);
  expect((await POST(request())).status).toBe(200);
  expect(messages).toHaveLength(2);
  const expiredToken = (await pool.query("select identifier from verification")).rows[0].identifier.replace(/^reset-password:/, "");
  await pool.query("update verification set expires_at=now()-interval '1 second'");
  expect(await getAuth().api.resetPassword({ body: { token: expiredToken, newPassword: oldPassword } }).then(() => false, () => true)).toBe(true);
  await pool.query("update profiles set active=false where role='client_admin'");
  expect((await POST(request())).status).toBe(403);
}, 30000);
