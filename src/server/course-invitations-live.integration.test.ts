import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Socket } from "node:net";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

let database: ReturnType<typeof drizzle>;
vi.mock("@/server/db", () => ({ getDb: () => database }));
import { getAuth } from "./auth";
import { POST as register } from "@/app/api/courses/route";
import { PATCH as review } from "@/app/api/admin/courses/route";
import { POST as accept } from "@/app/api/portal/invitations/accept/route";
import { POST as resend } from "@/app/api/admin/courses/access-email/route";
import { GET as portal } from "@/app/api/portal/route";
import { GET as learning } from "@/app/api/portal/learning/route";

const enabled = process.env.BOOKING_DB_TESTS === "1";
const fixtureSchema = `course_live_invite_${randomUUID().replaceAll("-", "")}`;
const origin = "http://localhost:3001", password = randomBytes(24).toString("hex");
let pool: Pool; let setupPool: Pool; let adminCookie = "";
const messages: string[] = [], sockets = new Set<Socket>();
// Real Nodemailer transport, but only an ephemeral loopback SMTP receiver exists.
const smtp = createServer((socket) => {
  sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => {});
  socket.write("220 localhost test SMTP\r\n"); let buffer = "", content = "", data = false;
  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    while (buffer.includes("\r\n")) {
      const end = buffer.indexOf("\r\n"), line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
      if (data) {
        if (line === ".") { messages.push(content); content = ""; data = false; socket.write("250 accepted\r\n"); }
        else content += `${line}\r\n`;
      } else if (/^(EHLO|HELO)/.test(line)) socket.write("250-localhost\r\n250 SIZE 1048576\r\n");
      else if (/^RCPT TO:/i.test(line) && !/@example\.test>/i.test(line)) socket.write("550 Fixture recipients only\r\n");
      else if (line === "DATA") { data = true; socket.write("354 send data\r\n"); }
      else if (line === "QUIT") socket.end("221 goodbye\r\n");
      else socket.write("250 OK\r\n");
    }
  });
});
const request = (path: string, cookie = "", body?: object, method = body ? "POST" : "GET") => new Request(`${origin}${path}`, { method, headers: { origin, cookie, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
async function signup(email: string) {
  const response = await getAuth().api.signUpEmail({ body: { name: "Invitation Journey Fixture", email, password }, asResponse: true });
  if (response.status !== 200) throw new Error("Fixture signup failed.");
  return { id: (await response.json()).user.id as string, cookie: response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ") };
}
beforeAll(async () => {
  if (!enabled) return;
  process.loadEnvFile(".env.local"); const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web" || !/^course_live_invite_[a-f0-9]{32}$/.test(fixtureSchema)) throw new Error("Verified local fixture database required.");
  await new Promise<void>((resolve) => smtp.listen(0, "127.0.0.1", resolve));
  const address = smtp.address(); if (!address || typeof address === "string" || address.address !== "127.0.0.1") throw new Error("Loopback SMTP required.");
  vi.stubEnv("SMTP_URL", `smtp://127.0.0.1:${address.port}?ignoreTLS=true`);
  vi.stubEnv("CONTACT_FROM", "Fixture <sender@example.test>"); vi.stubEnv("CONTACT_TO", "admin@example.test");
  vi.stubEnv("BETTER_AUTH_URL", origin); vi.stubEnv("COURSE_PORTAL_URL", origin); vi.stubEnv("BETTER_AUTH_SECRET", randomBytes(40).toString("hex")); vi.stubEnv("GOOGLE_CLIENT_ID", "");
  setupPool = new Pool({ connectionString: url.href }); await setupPool.query(`create schema "${fixtureSchema}"`);
  for (const table of ["user", "session", "account", "verification", "profiles", "courses", "course_offerings", "course_registrations", "registration_participants", "organisations", "organisation_memberships", "account_invitations", "audit_logs", "course_materials", "course_certificates", "course_invoices", "student_posts", "course_modules", "course_lessons"]) await setupPool.query(`create table "${fixtureSchema}"."${table}" (like public."${table}" including all)`);
  pool = new Pool({ connectionString: url.href, options: `-c search_path=${fixtureSchema},public` }); database = drizzle(pool);
  const admin = await signup("admin@example.test"); adminCookie = admin.cookie;
  await pool.query("update profiles set role='client_admin' where auth_user_id=$1", [admin.id]);
}, 30000);

it.skipIf(!enabled)("uses real browser signup/sign-in, resent email and profile access, including a lost activation response", async () => {
  const { chromium, expect: playwrightExpect } = await import("@playwright/test"); const browser = await chromium.launch();
  const browserExpect = playwrightExpect.configure({ timeout: 10000 });
  try { for (const width of [375, 1440]) {
    const email = `browser-${width}@example.test`, courseId = randomUUID(), offeringId = randomUUID(), moduleId = randomUUID();
    const title = `Authenticated course ${width}`, lesson = `Private lesson ${width}`;
    await pool.query("insert into courses(id,slug,title,summary,description,status) values($1::uuid,$1::text,$2,'Fixture','Fixture','published')", [courseId, title]);
    await pool.query("insert into course_offerings(id,course_id,code,starts_at,ends_at,delivery_mode,is_published,capacity_mode) values($1::uuid,$2,$1::text,'2097-10-01','2097-10-02','virtual',true,'unlimited')", [offeringId, courseId]);
    await pool.query("insert into course_modules(id,course_id,title,sort_order,is_published) values($1,$2,'Published module',0,true)", [moduleId, courseId]);
    await pool.query("insert into course_lessons(id,module_id,title,sort_order,is_published,content_type,text) values($1,$2,$3,0,true,'text','Authenticated learning content')", [randomUUID(), moduleId, lesson]);
    if (width === 1440) await signup(email); // Existing, unverified account must still prove email ownership.
    const submitted = await register(request("/api/courses", "", { offeringId, applicantName: "Browser Student", applicantEmail: email, consent: true, participants: [{ name: "Browser Student", email }] }));
    expect(submitted.status).toBe(201); const registrationId = (await submitted.json()).data.id;
    expect((await review(request("/api/admin/courses", adminCookie, { action: "registration_status", id: registrationId, status: "approved" }, "PATCH"))).status).toBe(200);
    const participantId = (await pool.query("select id from registration_participants where registration_id=$1", [registrationId])).rows[0].id;
    expect((await resend(request("/api/admin/courses/access-email", adminCookie, { registrationId, participantId, recipient: "participant" }))).status).toBe(200);
    const decoded = messages.map((message) => message.replace(/=\r\n/g, "").replace(/=3D/g, "=")).filter((message) => message.includes(`To: ${email}`) && message.includes("/portal/activate?token="));
    expect(decoded).toHaveLength(2);
    const activationUrl = decoded.at(-1)!.split("\r\n").find((line) => line.startsWith(`${origin}/portal/activate?token=`))!;
    const context = await browser.newContext({ viewport: { width, height: 1000 } }); const page = await context.newPage(); page.setDefaultTimeout(10000);
    let accepted = 0, signin = 0; const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.route("**/api/**", async (route) => {
        const outgoing = route.request(), method = outgoing.method(), path = new URL(outgoing.url()).pathname;
        if (path === "/api/site-content" && method === "GET") return route.continue(); // Public, read-only website shell.
        const incoming = new Request(outgoing.url(), { method, headers: outgoing.headers(), ...(!["GET", "HEAD"].includes(method) ? { body: outgoing.postData()! } : {}) });
        let response: Response;
        if (path.startsWith("/api/auth/")) { if (path.endsWith("/sign-in/email")) signin++; response = await getAuth().handler(incoming); }
        else if (path === "/api/portal/invitations/accept") {
          response = await accept(incoming);
          if (response.ok) { accepted++; if (width === 1440 && accepted === 1) return route.abort("failed"); }
        } else if (path === "/api/portal") response = await portal(incoming);
        else if (path === "/api/portal/learning") response = await learning(incoming);
        else throw new Error(`Unexpected API path in isolated invitation fixture: ${path}`);
        const headers = Object.fromEntries(response.headers); const cookies = response.headers.getSetCookie();
        if (cookies.length) headers["set-cookie"] = cookies.join("\n");
        await route.fulfill({ status: response.status, headers, body: await response.text() });
      });
      await page.goto(activationUrl);
      await page.getByLabel("Full name", { exact: true }).fill("Browser Student");
      await page.getByLabel("Invited email address").fill(email);
      await page.getByLabel("Create or enter password").fill(password);
      await page.getByRole("button", { name: "Activate portal", exact: true }).click();
      if (width === 1440) {
        await browserExpect(page.getByRole("status")).toContainText("Please try again");
        await page.getByRole("link", { name: "Sign in to your portal" }).click();
        await page.getByLabel("Email address", { exact: true }).fill(email); await page.getByLabel("Password", { exact: true }).fill(password);
        await page.getByRole("button", { name: "Sign in", exact: true }).click();
      }
      await browserExpect(page).toHaveURL(`${origin}/portal/profile`);
      await browserExpect(page.locator(".student-learning").getByRole("heading", { name: title, exact: true })).toBeVisible();
      const lessonSummary = page.locator(".student-learning summary").filter({ hasText: lesson });
      await browserExpect(lessonSummary).toBeVisible(); await lessonSummary.click();
      await browserExpect(page.getByText("Authenticated learning content", { exact: true })).toBeVisible();
      await page.reload(); await browserExpect(lessonSummary).toBeVisible();
      expect(accepted).toBe(1); expect(signin).toBe(width === 1440 ? 2 : 0); expect(errors).toEqual([]);
      expect((await pool.query('select u.email_verified from "user" u join profiles p on p.auth_user_id=u.id join registration_participants r on r.profile_id=p.id where r.id=$1 and u.email=$2', [participantId, email])).rows).toEqual([{ email_verified: true }]);
    } finally { await context.close(); }
  } } finally { await browser.close(); }
}, 60000);
afterAll(async () => {
  for (const socket of sockets) socket.destroy();
  if (smtp.listening) await new Promise<void>((resolve) => smtp.close(() => resolve()));
  if (pool) await pool.end();
  if (setupPool) { await setupPool.query(`drop schema if exists "${fixtureSchema}" cascade`); await setupPool.end(); }
  vi.unstubAllEnvs();
});

it.skipIf(!enabled)("registers, approves, sends and activates student and coordinator access with real sessions", async () => {
  const mailCount = messages.length;
  const courseId = randomUUID(), offeringId = randomUUID();
  await pool.query("insert into courses(id,slug,title,summary,description,status) values($1::uuid,$1::text,'Live invitation course','Fixture','Fixture','published')", [courseId]);
  await pool.query("insert into course_offerings(id,course_id,code,starts_at,ends_at,delivery_mode,is_published,capacity_mode) values($1::uuid,$2,$1::text,'2097-10-01','2097-10-02','virtual',true,'unlimited')", [offeringId, courseId]);
  const submitted = await register(request("/api/courses", "", { offeringId, applicantName: "Fixture Coordinator", applicantEmail: "coordinator@example.test", organisationName: "Fixture Organisation", consent: true, participants: [{ name: "Fixture Student", email: "student@example.test" }] }));
  expect(submitted.status).toBe(201); const registrationId = (await submitted.json()).data.id;
  expect(messages).toHaveLength(mailCount + 2);
  const approved = await review(request("/api/admin/courses", adminCookie, { action: "registration_status", id: registrationId, status: "approved" }, "PATCH"));
  expect(approved.status).toBe(200); expect((await approved.json()).notifications).toEqual({ attempted: 2, failed: 0 });
  expect(messages).toHaveLength(mailCount + 4);
  for (const role of ["student", "coordinator"]) {
    const email = `${role}@example.test`, account = await signup(email);
    const decoded = messages.map((message) => message.replace(/=\r\n/g, "").replace(/=3D/g, "=")).find((message) => message.includes(`To: ${email}`) && message.includes("/portal/activate?token="))!;
    const token = new URL(decoded.split("\r\n").find((line) => line.startsWith(`${origin}/portal/activate?token=`))!).searchParams.get("token")!;
    expect((await accept(request("/api/portal/invitations/accept", "", { token }))).status).toBe(401);
    expect((await accept(request("/api/portal/invitations/accept", adminCookie, { token }))).status).toBe(409);
    expect((await accept(request("/api/portal/invitations/accept", account.cookie, { token }))).status).toBe(200);
    expect((await accept(request("/api/portal/invitations/accept", account.cookie, { token }))).status).toBe(409);
    expect((await pool.query('select email_verified from "user" where id=$1', [account.id])).rows[0].email_verified).toBe(true);
    const snapshot = await portal(request("/api/portal", account.cookie)); expect(snapshot.status).toBe(200);
    expect((await snapshot.json()).data.registrations).toHaveLength(1);
    expect((await (await learning(request("/api/portal/learning", account.cookie))).json()).data).toHaveLength(role === "student" ? 1 : 0);
  }
}, 30000);
