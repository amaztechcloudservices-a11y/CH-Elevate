import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
let database: ReturnType<typeof drizzle>;
vi.mock("@/server/db", () => ({ getDb: () => database }));
vi.mock("@/server/course-mail", () => ({ sendCourseMail: vi.fn(async () => ({ delivered: true })) }));
vi.mock("@/server/admin-auth", async (original) => {
  const auth = await original<typeof import("@/server/admin-auth")>();
  return { ...auth, requireClientAdmin: async (request: Request) => {
    if (request.headers.get("x-fixture-admin") !== "yes") throw new auth.AdminAuthError(403, "Administrator required.");
    return { session: { user: { id: "offering-fixture" } } };
  } };
});
import { GET, POST, PATCH } from "@/app/api/admin/courses/route";
import { sendCourseMail } from "@/server/course-mail";
const enabled = process.env.BOOKING_DB_TESTS === "1", fixtureSchema = `course_offering_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool, setupPool: Pool;
const request = (body: unknown, origin = "http://localhost:3001", admin = true) => new Request("http://localhost:3001/api/admin/courses", { method: "POST", headers: { origin, ...(admin ? { "x-fixture-admin": "yes" } : {}) }, body: JSON.stringify(body) });
beforeAll(async () => {
  if (!enabled) return; process.loadEnvFile(".env.local"); const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web" || !/^course_offering_test_[a-f0-9]{32}$/.test(fixtureSchema)) throw new Error("Verified local fixture database required.");
  setupPool = new Pool({ connectionString: url.href }); await setupPool.query(`create schema "${fixtureSchema}"`);
  for (const table of ["courses", "course_offerings", "course_registrations", "registration_participants", "course_certificates", "audit_logs", "account_invitations", "user", "profiles", "organisation_memberships", "course_categories", "course_materials", "organisations"]) await setupPool.query(`create table "${fixtureSchema}"."${table}" (like public."${table}" including all)`);
  pool = new Pool({ connectionString: url.href, options: `-c search_path=${fixtureSchema},public` }); database = drizzle(pool);
});
afterAll(async () => { if (pool) await pool.end(); if (setupPool) { await setupPool.query(`drop schema "${fixtureSchema}" cascade`); await setupPool.end(); } });
async function fixture() {
  const courseId = randomUUID(); await pool.query("insert into courses(id,slug,title,summary,description) values($1::uuid,$1::text,'Offering fixture','Fixture','Fixture')", [courseId]);
  return { kind: "offering", courseId, code: randomUUID(), startsAt: "2097-10-01T14:00:00Z", endsAt: "2097-10-02T14:00:00Z", deliveryMode: "virtual", venue: "Fixture venue", joiningInstructions: "Fixture instructions", feeCents: 12525, currency: "JMD", capacityMode: "hard", capacity: 10, registrationOpensAt: null, registrationClosesAt: null, substitutionCutoffAt: null, isPublished: false };
}
async function createdOffering() {
  const input = await fixture(), response = await POST(request(input)); expect(response.status).toBe(201);
  const row = (await response.json()).data;
  const details = Object.fromEntries(Object.entries(input).filter(([key]) => !["kind", "courseId", "code"].includes(key)));
  return { row, edit: { ...details, action: "offering_update", id: row.id, updatedAt: row.updatedAt } };
}
it.skipIf(!enabled)("the offering forms retain failures, reject stale drafts and preserve delivery warnings at three widths", async () => {
  const { chromium, expect: rawExpect } = await import("@playwright/test");
  const browserExpect = rawExpect.configure({ timeout: 10000 }), browser = await chromium.launch();
  try { for (const width of [375, 1024, 1440]) {
    const input = await fixture(), page = await browser.newPage({ viewport: { width, height: 1000 } });
    page.setDefaultTimeout(10000);
    let creates = 0, edits = 0, savedId = "";
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.route("**/api/admin/**", async (route) => {
        const outgoing = route.request(), path = new URL(outgoing.url()).pathname;
        if (path === "/api/admin/course-catalogue") return route.fulfill({ json: { ok: true, data: [], categories: [], instructors: [] } });
        if (path !== "/api/admin/courses") return route.fulfill({ json: { ok: true, data: {} } });
        let response: Response;
        if (outgoing.method() === "POST") {
          creates++;
          if (creates === 1) return route.abort("failed");
          const body = outgoing.postDataJSON(); expect(body.fee).toBeUndefined(); expect(body.feeCents).toBe(12525);
          response = await POST(request(body));
          if (response.ok) savedId = (await response.clone().json()).data.id;
        } else if (outgoing.method() === "PATCH") {
          edits++;
          if (edits === 1) return route.abort("failed");
          response = await PATCH(request(outgoing.postDataJSON()));
        } else response = await GET(new Request("http://localhost:3001/api/admin/courses", { headers: { "x-fixture-admin": "yes" } }));
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
      });
      await page.goto("http://localhost:3001/admin/courses");
      await page.getByRole("button", { name: "Courses & offerings", exact: true }).click();
      const create = page.locator("form").filter({ has: page.getByRole("heading", { name: "Schedule offering", exact: true }) });
      const edit = page.locator("form").filter({ has: page.getByRole("heading", { name: "Update schedule", exact: true }) });
      const notice = page.locator('.course-admin > .cms-admin__notice[role="status"]');
      await create.locator('select[name="courseId"]').selectOption(input.courseId);
      await create.getByLabel("Offering code", { exact: true }).fill(input.code);
      await create.getByLabel("Starts (Jamaica time)", { exact: true }).fill("2097-10-01T09:00");
      await create.getByLabel("Ends (Jamaica time)", { exact: true }).fill("2097-10-02T09:00");
      await create.getByLabel("Fee (JMD)", { exact: true }).fill("125.25");
      await create.getByLabel("Venue or platform", { exact: true }).fill("Browser venue");
      await create.getByRole("button", { name: "Schedule offering", exact: true }).click();
      await browserExpect(notice).toContainText("draft is still here");
      await browserExpect(create.getByLabel("Offering code", { exact: true })).toHaveValue(input.code);
      await create.getByRole("button", { name: "Schedule offering", exact: true }).click();
      await browserExpect(notice).toHaveText("Offering scheduled.");
      expect(savedId).not.toBe("");
      await pool.query("insert into course_registrations(offering_id,applicant_name,applicant_email) values($1,'Fixture','browser@example.test')", [savedId]);
      const selector = edit.locator('select[name="id"]');
      await selector.selectOption(savedId);
      const venue = edit.getByLabel("Venue or platform", { exact: true }), save = edit.getByRole("button", { name: "Save schedule and notify", exact: true });
      await venue.fill("Browser updated venue");
      await save.click(); await browserExpect(notice).toContainText("draft is still here"); await browserExpect(venue).toHaveValue("Browser updated venue");
      await pool.query("update course_offerings set venue='Other administrator',updated_at=updated_at+interval '1 second' where id=$1", [savedId]);
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await save.click(); await browserExpect(notice).toContainText("Refresh and reselect"); await browserExpect(venue).toHaveValue("Browser updated venue");
      await selector.selectOption(""); await selector.selectOption(savedId);
      await browserExpect(venue).toHaveValue("Other administrator"); await venue.fill("Browser updated venue");
      vi.mocked(sendCourseMail).mockResolvedValueOnce({ delivered: false });
      await save.click(); await browserExpect(notice).toContainText("saved, but"); await browserExpect(notice).toContainText("not delivered");
      await browserExpect(selector).toHaveValue("");
      await page.reload(); await page.getByRole("button", { name: "Courses & offerings", exact: true }).click();
      await selector.selectOption(savedId); await browserExpect(venue).toHaveValue("Browser updated venue");
      expect((await pool.query("select fee_cents from course_offerings where id=$1", [savedId])).rows[0].fee_cents).toBe(12525);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await venue.evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Manrope");
      await page.screenshot({ path: `test-results/course-offering-${width}.png` }); expect(errors).toEqual([]);
    } finally { await page.close(); }
  } } finally { await browser.close(); }
}, 90000);
it.skipIf(!enabled)("serializes schedule edits, reports failed delivery and prevents stale or cancelled publication", async () => {
  const { row, edit } = await createdOffering();
  await pool.query("insert into course_registrations(offering_id,applicant_name,applicant_email) values($1,'Fixture','notice@example.test')", [row.id]);
  vi.mocked(sendCourseMail).mockResolvedValueOnce({ delivered: false });
  const result = await PATCH(request({ ...edit, venue: "Updated venue" })); expect(result.status).toBe(200);
  const saved = await result.json(); expect(saved.message).toContain("saved, but"); expect(saved.message).toContain("not delivered");
  expect((await PATCH(request({ ...edit, venue: "Stale overwrite" }))).status).toBe(409);
  expect((await pool.query("select venue from course_offerings where id=$1", [row.id])).rows[0].venue).toBe("Updated venue");
  expect((await PATCH(request({ action: "offering_published", id: randomUUID(), published: true }))).status).toBe(404);
  await pool.query("update course_offerings set is_cancelled=true where id=$1", [row.id]);
  expect((await PATCH(request({ action: "offering_published", id: row.id, published: true }))).status).toBe(409);
});
it.skipIf(!enabled)("rolls back schedule and publication changes when their audit fails", async () => {
  const { row, edit } = await createdOffering();
  await pool.query(`create function "${fixtureSchema}".reject_edit_audit() returns trigger language plpgsql as $$ begin if NEW.action in ('course.offering_updated','course.offering_published_updated') then raise exception 'fixture audit failure'; end if; return NEW; end $$`);
  await pool.query(`create trigger reject_edit_audit before insert on "${fixtureSchema}".audit_logs for each row execute function "${fixtureSchema}".reject_edit_audit()`);
  try {
    expect((await PATCH(request({ ...edit, venue: "Not saved" }))).status).toBe(500);
    expect((await PATCH(request({ action: "offering_published", id: row.id, published: true }))).status).toBe(500);
    expect((await pool.query("select venue,is_published from course_offerings where id=$1", [row.id])).rows[0]).toEqual({ venue: row.venue, is_published: false });
  } finally { await pool.query(`drop trigger reject_edit_audit on "${fixtureSchema}".audit_logs`); }
});
it.skipIf(!enabled)("requires same-origin strict course writes and valid bounded offering values", async () => {
  const body = await fixture();
  expect((await POST(request(body, undefined, false))).status).toBe(403);
  expect((await POST(request(body, "https://untrusted.example"))).status).toBe(403);
  for (const action of ["offering_update", "offering_published", "archive_material", "course_active", "bulk_registration_status"]) expect((await PATCH(request({ action }, "https://untrusted.example"))).status, action).toBe(403);
  for (const extra of [{ extra: true }, { feeCents: 2147483648 }, { feeCents: 1.2 }, { currency: "XYZ" }, { startsAt: null }, { startsAt: 0 }, { endsAt: body.startsAt }, { capacity: null }, { registrationOpensAt: "2097-10-01T12:00:00Z", registrationClosesAt: "2097-09-01T12:00:00Z" }]) expect((await POST(request({ ...body, ...extra }))).status).toBe(422);
  expect((await POST(request(null))).status).toBe(422);
  expect((await POST(request({ ...body, courseId: randomUUID() }))).status).toBe(404);
  expect((await pool.query("select id from course_offerings where course_id=$1", [body.courseId])).rows).toHaveLength(0);
});
it.skipIf(!enabled)("creates exactly one duplicate code and rolls creation back if audit fails", async () => {
  const body = await fixture(); const results = await Promise.all([POST(request(body)), POST(request(body))]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  expect((await pool.query("select fee_cents from course_offerings where code=$1", [body.code])).rows).toEqual([{ fee_cents: 12525 }]);
  await pool.query(`create function "${fixtureSchema}".reject_offering_audit() returns trigger language plpgsql as $$ begin if NEW.action like 'course.offering%' then raise exception 'fixture audit failure'; end if; return NEW; end $$`);
  await pool.query(`create trigger reject_offering_audit before insert on "${fixtureSchema}".audit_logs for each row execute function "${fixtureSchema}".reject_offering_audit()`);
  const other = await fixture();
  try { expect((await POST(request(other))).status).toBe(500); expect((await pool.query("select id from course_offerings where code=$1", [other.code])).rows).toHaveLength(0); }
  finally { await pool.query(`drop trigger reject_offering_audit on "${fixtureSchema}".audit_logs`); }
});
