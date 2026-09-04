import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
let database: ReturnType<typeof drizzle>;
vi.mock("@/server/db", () => ({ getDb: () => database }));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ api: { getSession: async ({ headers }: { headers: Headers }) => {
  const id = headers.get("x-fixture-user"); return id ? { user: { id, email: `${id}@example.test` } } : null;
} } }) }));
import { POST } from "@/app/api/admin/courses/roster/route";
import { GET as adminSnapshot } from "@/app/api/admin/courses/route";
const enabled = process.env.BOOKING_DB_TESTS === "1";
const fixtureSchema = `course_roster_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool; let setupPool: Pool;
const request = (body: FormData, actor = "roster-admin", origin = "http://localhost:3001") => new Request("http://localhost:3001/api/admin/courses/roster", { method: "POST", headers: { origin, ...(actor ? { "x-fixture-user": actor } : {}) }, body });
function form(offeringId: string, text = 'name,email,phone\n"Henry, Arvette",STUDENT@example.test,+18761234567') {
  const data = new FormData(); for (const [key, value] of Object.entries({ offeringId, organisationName: "Roster fixture", applicantName: "Coordinator Example", applicantEmail: "coordinator@example.test" })) data.set(key, value);
  data.set("file", new File([text], "roster.csv", { type: "text/csv" })); return data;
}
beforeAll(async () => {
  if (!enabled) return;
  process.loadEnvFile(".env.local"); const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web" || !/^course_roster_test_[a-f0-9]{32}$/.test(fixtureSchema)) throw new Error("Verified local fixture database required.");
  setupPool = new Pool({ connectionString: url.href }); await setupPool.query(`create schema "${fixtureSchema}"`);
  for (const table of ["courses", "course_offerings", "course_registrations", "registration_participants", "organisations", "profiles", "audit_logs", "course_materials", "user"]) await setupPool.query(`create table "${fixtureSchema}"."${table}" (like public."${table}" including all)`);
  pool = new Pool({ connectionString: url.href, options: `-c search_path=${fixtureSchema},public` }); database = drizzle(pool);
  for (const [actor, role] of [["roster-admin", "client_admin"], ["roster-customer", "customer"]]) await pool.query("insert into profiles(auth_user_id,display_name,role) values($1,'Roster fixture',$2)", [actor, role]);
});
afterAll(async () => { if (pool) await pool.end(); if (setupPool) { await setupPool.query(`drop schema if exists "${fixtureSchema}" cascade`); await setupPool.end(); } });
async function offering() {
  const courseId = randomUUID(); await pool.query("insert into courses(id,slug,title,summary,description) values($1,$2,'Roster course','Fixture','Fixture')", [courseId, courseId]);
  return (await pool.query("insert into course_offerings(course_id,code,starts_at,ends_at,delivery_mode,fee_cents) values($1,$2,'2097-10-01','2097-10-02','virtual',12545) returning id", [courseId, randomUUID()])).rows[0].id as string;
}
it.skipIf(!enabled)("protects roster imports and rejects invalid rows without partial registration", async () => {
  const id = await offering();
  expect((await POST(request(form(id), ""))).status).toBe(401); expect((await POST(request(form(id), "roster-customer"))).status).toBe(403);
  expect((await POST(request(form(id), "roster-admin", "https://untrusted.example"))).status).toBe(403);
  for (const text of ["name,email\nMissing,", "name,email\nStudent Example,not-email", 'name,email\n"Incomplete,student@example.test']) expect((await POST(request(form(id, text)))).status).toBe(422);
  const duplicate = form(id); duplicate.append("offeringId", randomUUID()); expect((await POST(request(duplicate))).status).toBe(422);
  const extra = form(id); extra.set("status", "approved"); expect((await POST(request(extra))).status).toBe(422);
  const oversized = request(form(id)); oversized.headers.set("content-length", "2000000"); expect((await POST(oversized)).status).toBe(422);
  expect((await POST(request(form(randomUUID())))).status).toBe(404);
  await pool.query("update profiles set active=false where auth_user_id='roster-admin'");
  try { expect((await POST(request(form(id)))).status).toBe(403); } finally { await pool.query("update profiles set active=true where auth_user_id='roster-admin'"); }
  expect((await pool.query("select id from course_registrations where offering_id=$1", [id])).rows).toHaveLength(0);
});
it.skipIf(!enabled)("validates CSV encoding, type and total amount before importing any seats", async () => {
  const id = await offering();
  for (const file of [new File([new Uint8Array([0xff, 0xfe, 0x00])], "roster.csv", { type: "text/csv" }), new File(["name,email\nStudent Example,student@example.test"], "roster.pdf", { type: "application/pdf" }), new File([], "roster.csv", { type: "text/csv" }), new File([new Uint8Array(1024 * 1024 + 1)], "roster.csv", { type: "text/csv" })]) {
    const data = form(id); data.set("file", file); expect((await POST(request(data))).status).toBe(422);
  }
  const text = "name,email\nFirst Student,first@example.test\nSecond Student,second@example.test";
  await pool.query("update course_offerings set fee_cents=2147483647 where id=$1", [id]);
  expect((await POST(request(form(id, text)))).status).toBe(422);
  expect((await pool.query("select id from course_registrations where offering_id=$1", [id])).rows).toHaveLength(0);
  await pool.query("update course_offerings set fee_cents=12545 where id=$1", [id]);
  const data = form(id, text); data.set("file", new File([text], "roster.csv", { type: "application/vnd.ms-excel" }));
  const response = await POST(request(data)); expect(response.status).toBe(201);
  expect((await response.json()).data).toMatchObject({ participantCount: 2, amountDueCents: 25090, status: "pending_review" });
  expect((await pool.query("select count(*)::int as count from registration_participants where offering_id=$1", [id])).rows[0].count).toBe(2);
});
it.skipIf(!enabled)("preserves quoted names and exact offering fees, leaves seats pending and rejects duplicate concurrent imports", async () => {
  const id = await offering(); const results = await Promise.all([POST(request(form(id))), POST(request(form(id)))]);
  expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
  const rows = (await pool.query("select name,email,phone,status,profile_id from registration_participants where offering_id=$1", [id])).rows;
  expect(rows).toEqual([{ name: "Henry, Arvette", email: "student@example.test", phone: "+18761234567", status: "pending_review", profile_id: null }]);
  expect((await pool.query("select amount_due_cents,status,payment_status from course_registrations where offering_id=$1", [id])).rows).toEqual([{ amount_due_cents: 12545, status: "pending_review", payment_status: "unpaid" }]);
  await pool.query("update course_offerings set is_cancelled=true where id=$1", [id]);
  expect((await POST(request(form(id, "name,email\nOther Student,other@example.test")))).status).toBe(409);
});
it.skipIf(!enabled)("rolls back the organisation, registration and seats if the import audit fails", async () => {
  const id = await offering(); const before = (await pool.query("select id from organisations")).rows;
  await pool.query(`create function "${fixtureSchema}".reject_roster_audit() returns trigger language plpgsql as $$ begin if NEW.action = 'course.roster_imported' then raise exception 'fixture audit failure'; end if; return NEW; end $$`);
  await pool.query(`create trigger roster_audit_failure before insert on audit_logs for each row execute function "${fixtureSchema}".reject_roster_audit()`);
  try { expect((await POST(request(form(id)))).status).toBe(500); } finally { await pool.query("drop trigger roster_audit_failure on audit_logs"); }
  expect((await pool.query("select id from course_registrations where offering_id=$1", [id])).rows).toHaveLength(0);
  expect((await pool.query("select id from registration_participants where offering_id=$1", [id])).rows).toHaveLength(0);
  expect((await pool.query("select id from organisations")).rows).toEqual(before);
});
it.skipIf(!enabled)("imports from the actual admin form, preserves invalid input for correction, and reloads pending seats", async () => {
  const { chromium } = await import("@playwright/test"); const browser = await chromium.launch();
  try {
    for (const width of [375, 1440]) {
      const id = await offering(); const name = `Roster browser ${width}`;
      const page = await browser.newPage({ viewport: { width, height: 950 } }); page.setDefaultTimeout(10000);
      const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.route("**/api/admin/**", async (route) => {
          const path = new URL(route.request().url()).pathname; const headers = new Headers(route.request().headers()); headers.set("x-fixture-user", "roster-admin");
          let response: Response;
          if (path === "/api/admin/courses/roster") response = await POST(new Request(route.request().url(), { method: "POST", headers, body: new Uint8Array(route.request().postDataBuffer()!) }));
          else if (path === "/api/admin/courses") response = await adminSnapshot(new Request(route.request().url(), { headers }));
          else { await route.fulfill({ json: { ok: true } }); return; }
          await route.fulfill({ status: response.status, body: await response.text(), contentType: "application/json" });
        });
        await page.goto("http://localhost:3001/admin/courses");
        const element = page.locator("form").filter({ has: page.getByRole("heading", { name: "Import organisation roster" }) });
        await element.getByRole("combobox", { name: "Offering", exact: true }).selectOption(id);
        await element.getByLabel("Organisation", { exact: true }).fill(name);
        await element.getByLabel("Coordinator name", { exact: true }).fill("Coordinator Example");
        await element.getByLabel("Coordinator email", { exact: true }).fill("coordinator@example.test");
        const upload = (text: string) => element.getByLabel("Roster CSV").setInputFiles({ name: "roster.csv", mimeType: "text/csv", buffer: Buffer.from(text) });
        await upload("name,email\nMissing email,"); await element.getByRole("button", { name: "Import roster", exact: true }).click();
        await expect.poll(() => page.getByRole("status").textContent()).toContain("Participant row 1");
        expect(await element.getByLabel("Organisation", { exact: true }).inputValue()).toBe(name);
        expect((await pool.query("select id from course_registrations where offering_id=$1", [id])).rows).toHaveLength(0);
        await upload(`name,email\n"${name}, First",first@example.test\n${name} Second,second@example.test`);
        await element.getByRole("button", { name: "Import roster", exact: true }).click();
        await expect.poll(() => page.getByRole("status").textContent()).toContain("2 participants imported for administrator review");
        await page.reload(); await expect.poll(() => page.getByLabel(`Registration status for ${name}, First`, { exact: true }).inputValue()).toBe("pending_review");
        expect((await pool.query("select amount_due_cents,payment_status from course_registrations where offering_id=$1", [id])).rows).toEqual([{ amount_due_cents: 25090, payment_status: "unpaid" }]);
        expect(errors).toEqual([]);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
}, 60000);
