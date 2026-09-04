import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { emptyCourse } from "@/lib/course-catalogue";
let database: ReturnType<typeof drizzle>;
vi.mock("@/server/db", () => ({ getDb: () => database }));
vi.mock("@/server/course-mail", () => ({ sendCourseMail: vi.fn(async () => ({ delivered: true })) }));
vi.mock("@/server/admin-auth", async (original) => {
  const auth = await original<typeof import("@/server/admin-auth")>();
  return { ...auth, requireClientAdmin: async (request: Request) => { if (request.headers.get("x-fixture-admin") !== "yes") throw new auth.AdminAuthError(403, "Administrator required."); return { session: { user: { id: "enrolment-fixture" } } }; } };
});
import { GET, PATCH } from "@/app/api/admin/courses/route";
import { POST as catalogue } from "@/app/api/admin/course-catalogue/route";
const enabled = process.env.BOOKING_DB_TESTS === "1";
const fixtureSchema = `course_enrolment_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool; let setupPool: Pool;
const request = (body: object, origin = "http://localhost:3001", admin = true) => new Request("http://localhost:3001/api/admin/courses", { method: "PATCH", headers: { origin, ...(admin ? { "x-fixture-admin": "yes" } : {}) }, body: JSON.stringify(body) });
const update = async (id: string, status = "approved", overrideCapacity = false) => { const response = await PATCH(request({ action: "registration_status", id, status, overrideCapacity })); expect(response.status).toBe(200); return response.json(); };
beforeAll(async () => {
  if (!enabled) return;
  process.loadEnvFile(".env.local"); const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web" || !/^course_enrolment_test_[a-f0-9]{32}$/.test(fixtureSchema)) throw new Error("Verified local fixture database required.");
  setupPool = new Pool({ connectionString: url.href }); await setupPool.query(`create schema "${fixtureSchema}"`);
  for (const table of ["courses", "course_offerings", "course_registrations", "registration_participants", "course_certificates", "audit_logs", "account_invitations", "user", "profiles", "organisation_memberships", "course_categories", "course_materials", "organisations"]) await setupPool.query(`create table "${fixtureSchema}"."${table}" (like public."${table}" including all)`);
  pool = new Pool({ connectionString: url.href, options: `-c search_path=${fixtureSchema},public` }); database = drizzle(pool);
});
afterAll(async () => { if (pool) await pool.end(); if (setupPool) { await setupPool.query(`drop schema "${fixtureSchema}" cascade`); await setupPool.end(); } });
async function fixture(limit: number | null, modes = ["unlimited", "unlimited"]) {
  const courseId = randomUUID(); const offeringIds: string[] = [];
  await pool.query("insert into courses(id,slug,title,summary,description,enrollment_limit) values($1::uuid,$1::text,'Capacity fixture','Fixture summary','Fixture description',$2)", [courseId, limit]);
  for (const mode of modes) offeringIds.push((await pool.query("insert into course_offerings(course_id,code,starts_at,ends_at,delivery_mode,capacity_mode,capacity) values($1,$2,'2097-01-01','2097-01-02','virtual',$3,1) returning id", [courseId, randomUUID(), mode])).rows[0].id);
  return { courseId, offeringIds };
}
async function registration(offeringId: string, seats = 1) {
  const id = (await pool.query("insert into course_registrations(offering_id,applicant_name,applicant_email) values($1,'Fixture applicant','fixture@example.test') returning id", [offeringId])).rows[0].id;
  const participants: string[] = [];
  for (let index = 0; index < seats; index++) participants.push((await pool.query("insert into registration_participants(registration_id,offering_id,name,email,email_normalized) values($1,$2,'Fixture person',$3,$3) returning id", [id, offeringId, `${id}-${index}@example.test`])).rows[0].id);
  return { id, participants };
}
it.skipIf(!enabled)("serializes approvals across offerings, counts groups once per participant and cannot override the course limit", async () => {
  const { courseId, offeringIds } = await fixture(2); const a = await registration(offeringIds[0], 2); const b = await registration(offeringIds[1], 2);
  const results = await Promise.all([update(a.id), update(b.id)]); expect(results.map((r) => r.data.status).sort()).toEqual(["approved", "waitlisted"]);
  const approved = results.find((r) => r.data.status === "approved")!.data.id; const waitlisted = approved === a.id ? b.id : a.id;
  expect((await update(waitlisted, "approved", true)).message).toContain("Course-wide enrolment limit");
  expect((await pool.query("select count(*)::int as count from registration_participants p join course_offerings o on o.id=p.offering_id where o.course_id=$1 and p.status in ('approved','completed')", [courseId])).rows[0].count).toBe(2);
  const invitationCount = (await pool.query("select count(*)::int as count from account_invitations where registration_id=$1", [approved])).rows[0].count;
  await Promise.all([update(approved), update(approved)]); expect((await pool.query("select count(*)::int as count from account_invitations where registration_id=$1", [approved])).rows[0].count).toBe(invitationCount);
  await update(approved, "cancelled"); expect((await update(waitlisted)).data.status).toBe("approved");
});
it.skipIf(!enabled)("retains offering capacity and blocks completion as an approval bypass", async () => {
  const { offeringIds } = await fixture(null, ["hard"]); const a = await registration(offeringIds[0]); const b = await registration(offeringIds[0]);
  expect((await update(a.id)).data.status).toBe("approved"); expect((await update(b.id)).data.status).toBe("waitlisted");
  expect((await PATCH(request({ action: "attendance", participantIds: b.participants, attendance: "attended", complete: true }))).status).toBe(409);
  expect((await PATCH(request({ action: "registration_status", id: b.id, status: "completed" }))).status).toBe(409);
  expect((await update(b.id, "approved", true)).data.status).toBe("approved");
  expect((await PATCH(request({ action: "attendance", participantIds: a.participants, attendance: "attended", complete: true }))).status).toBe(200);
  expect((await update(a.id, "completed")).data.status).toBe("completed");
  expect((await PATCH(request({ action: "attendance", participantIds: b.participants, attendance: "attended", complete: true }, "https://untrusted.example"))).status).toBe(403);
  expect((await PATCH(request({ action: "registration_status", id: b.id, status: "approved" }, "http://localhost:3001", false))).status).toBe(403);
});
it.skipIf(!enabled)("enforces bulk approval, protects completed enrolments when lowering limits and retains unlimited", async () => {
  const { courseId, offeringIds } = await fixture(2); const a = await registration(offeringIds[0]); const b = await registration(offeringIds[1], 2);
  const bulk = await PATCH(request({ action: "bulk_registration_status", ids: [a.id, b.id], status: "approved" })); expect(bulk.status).toBe(200); expect((await bulk.json()).data.map((r: { status: string }) => r.status)).toEqual(["approved", "waitlisted"]);
  expect((await PATCH(request({ action: "attendance", participantIds: a.participants, attendance: "attended", complete: true }))).status).toBe(200);
  const saved = (await pool.query("select updated_at from courses where id=$1", [courseId])).rows[0];
  const data = { ...emptyCourse, title: "Capacity fixture", slug: courseId, summary: "Fixture summary", description: "Fixture description", enrollmentLimit: null };
  const changed = await catalogue(request({ action: "update", id: courseId, updatedAt: saved.updated_at.toISOString(), data })); expect(changed.status).toBe(200);
  expect((await update(b.id)).data.status).toBe("approved");
  const latest = (await changed.json()).data;
  const tooLow = await catalogue(request({ action: "update", id: courseId, updatedAt: latest.updatedAt, data: { ...data, enrollmentLimit: 2 } })); expect(tooLow.status).toBe(409);
  const exact = await catalogue(request({ action: "update", id: courseId, updatedAt: latest.updatedAt, data: { ...data, enrollmentLimit: 3 } })); expect(exact.status).toBe(200);
  await PATCH(request({ action: "offering_cancel", id: offeringIds[1] })); expect((await PATCH(request({ action: "registration_status", id: b.id, status: "approved" }))).status).toBe(409);
});

it.skipIf(!enabled)("browser status control persists a waitlist decision and explains the course limit", async () => {
  const { chromium } = await import("@playwright/test");
  const { offeringIds } = await fixture(1); const first = await registration(offeringIds[0]); const next = await registration(offeringIds[1]);
  await update(first.id);
  await pool.query("update registration_participants set name='Capacity browser student' where registration_id=$1", [next.id]);
  expect((await GET(request({}))).status).toBe(200);
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    // Real Next UI and actual route/database code; only authorization and outbound mail are fixtures.
    await page.route("**/api/admin/**", async (route) => {
      const incoming = route.request();
      if (new URL(incoming.url()).pathname !== "/api/admin/courses") return route.fulfill({ json: { ok: true, data: {} } });
      const response = incoming.method() === "PATCH" ? await PATCH(request(incoming.postDataJSON())) : await GET(request({}));
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });
    await page.goto("http://localhost:3001/admin/courses");
    const control = page.getByRole("combobox", { name: "Registration status for Capacity browser student", exact: true });
    await control.selectOption("approved");
    await page.getByText(/Course-wide enrolment limit reached/).waitFor();
    expect(await control.inputValue()).toBe("waitlisted");
    expect((await pool.query("select status from course_registrations where id=$1", [next.id])).rows[0].status).toBe("waitlisted");
    await page.reload(); await control.waitFor(); expect(await control.inputValue()).toBe("waitlisted");
    const row = page.getByRole("row").filter({ has: control });
    await row.getByRole("button", { name: "Override offering capacity", exact: true }).click();
    await page.getByText(/Course-wide enrolment limit reached/).waitFor(); expect(await control.inputValue()).toBe("waitlisted");
  } finally { await browser.close(); }
}, 60000);

it.skipIf(!enabled)("serializes a catalogue limit reduction against an approval", async () => {
  const { courseId, offeringIds } = await fixture(2); const a = await registration(offeringIds[0]); const b = await registration(offeringIds[1]); await update(a.id);
  const version = (await pool.query("select updated_at from courses where id=$1", [courseId])).rows[0].updated_at.toISOString();
  const [edit, approval] = await Promise.all([
    catalogue(request({ action: "update", id: courseId, updatedAt: version, data: { ...emptyCourse, title: "Capacity fixture", slug: courseId, summary: "Fixture summary", description: "Fixture description", enrollmentLimit: 1 } })),
    update(b.id),
  ]);
  const counts = (await pool.query("select c.enrollment_limit, count(p.id) filter(where p.status in ('approved','completed'))::int as enrolled from courses c join course_offerings o on o.course_id=c.id left join registration_participants p on p.offering_id=o.id where c.id=$1 group by c.id", [courseId])).rows[0];
  expect(counts.enrolled).toBeLessThanOrEqual(counts.enrollment_limit);
  expect(edit.status === 200 ? approval.data.status === "waitlisted" : edit.status === 409 && approval.data.status === "approved").toBe(true);
});
