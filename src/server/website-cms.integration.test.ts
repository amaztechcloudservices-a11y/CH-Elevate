import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { defaultCmsSnapshot } from "@/lib/cms";
import { defaultWebsiteCms } from "@/lib/website-cms";
let database: ReturnType<typeof drizzle>;
vi.mock("@/server/db", () => ({ getDb: () => database }));
vi.mock("@/server/admin-auth", async (original) => {
  const auth = await original<typeof import("@/server/admin-auth")>();
  return { ...auth, requireClientAdmin: async (request: Request) => {
    if (request.headers.get("x-fixture-admin") !== "yes") throw new auth.AdminAuthError(403, "Administrator required.");
    return { session: { user: { id: "website-fixture" } } };
  } };
});
import { GET, PATCH } from "@/app/api/admin/cms/route";
import { PATCH as bookingSettings } from "@/app/api/admin/booking-settings/route";
import { GET as inbox, PATCH as updateInbox } from "@/app/api/admin/submissions/route";
const enabled = process.env.BOOKING_DB_TESTS === "1";
const schema = `website_cms_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool; let setup: Pool;
const request = (body?: unknown, origin = "http://localhost:3001", admin = "yes", path = "cms") => new Request(`http://localhost:3001/api/admin/${path}`, { method: body === undefined ? "GET" : "PATCH", headers: { origin, "x-fixture-admin": admin, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
beforeAll(async () => {
  if (!enabled) return;
  process.loadEnvFile(".env.local"); const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web") throw new Error("Verified local fixture database required.");
  setup = new Pool({ connectionString: url.href }); await setup.query(`create schema "${schema}"`);
  for (const table of ["cms_documents", "audit_logs", "booking_events", "courses", "form_submissions"]) await setup.query(`create table "${schema}"."${table}" (like public."${table}" including all)`);
  pool = new Pool({ connectionString: url.href, options: `-c search_path=${schema},public` }); database = drizzle(pool);
  await pool.query("insert into cms_documents(key,document_type,data) values('availability','availability',$1),('forms','forms',$2),('unrelated','unknown',$3)", [JSON.stringify({ untouched: "invalid legacy availability must not affect Website reads" }), JSON.stringify(defaultCmsSnapshot.forms), JSON.stringify({ keep: true })]);
  await pool.query("insert into booking_events(slug,data) values('untouched',$1)", [JSON.stringify({ untouched: true })]);
  await pool.query("insert into courses(slug,title,summary,description) values('untouched','Untouched course','Summary','Description')");
});
afterAll(async () => { if (pool) await pool.end(); if (setup) { await setup.query(`drop schema "${schema}" cascade`); await setup.end(); } });
const protectedState = async () => ({ docs: (await pool.query("select * from cms_documents where key not in ('global','hero_slides','pages','forms') order by key")).rows, events: (await pool.query("select * from booking_events")).rows, courses: (await pool.query("select * from courses")).rows });

async function inboxFixture() {
  const rows = (await pool.query("insert into form_submissions(form_key,payload) values('contact','{\"email\":\"inbox@example.test\",\"message\":\"Fixture message\"}'),('booking','{\"private\":\"Booking fixture\"}') returning *")).rows;
  return { contact: rows[0], booking: rows[1], body: { id: rows[0].id, status: "reviewed", updatedAt: rows[0].updated_at.toISOString() } };
}

it.skipIf(!enabled)("returns website-only content and rejects mixed contracts and cross-origin writes", async () => {
  const response = await GET(request()); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  const data = (await response.json()).data; expect(Object.keys(data).sort()).toEqual(["forms", "heroSlides", "pages", "settings"]);
  expect(data.forms.some((form: { key: string }) => form.key === "booking")).toBe(false);
  expect((await PATCH(request(defaultCmsSnapshot))).status).toBe(422);
  expect((await PATCH(request({ ...data, forms: defaultCmsSnapshot.forms }))).status).toBe(422);
  expect((await PATCH(request(data, "https://untrusted.example"))).status).toBe(403);
  expect((await PATCH(request(data, undefined, "no"))).status).toBe(403);
  expect((await GET(request(undefined, undefined, "no"))).status).toBe(403);
  expect((await bookingSettings(request(defaultCmsSnapshot.availability, "https://untrusted.example", "yes", "booking-settings"))).status).toBe(403);
  expect((await bookingSettings(request({ ...defaultCmsSnapshot.availability, settings: data.settings }, undefined, "yes", "booking-settings"))).status).toBe(422);
});
it.skipIf(!enabled)("publishes website documents without changing booking/course records or the hidden legacy form", async () => {
  const before = await protectedState(); const data = defaultWebsiteCms(); data.settings.brandName = "Isolated website edit";
  expect((await PATCH(request(data))).status).toBe(200);
  expect((await (await GET(request())).json()).data.settings.brandName).toBe("Isolated website edit");
  expect(await protectedState()).toEqual(before);
  const forms = (await pool.query("select data from cms_documents where key='forms'")).rows[0].data;
  expect(forms.filter((form: { key: string }) => form.key === "booking")).toEqual(defaultCmsSnapshot.forms.filter((form) => form.key === "booking"));
  expect((await pool.query("select action from audit_logs")).rows).toEqual([{ action: "website.content_published" }]);
});
it.skipIf(!enabled)("rejects malformed stored website content instead of offering defaults to overwrite it", async () => {
  await pool.query("update cms_documents set data='{}' where key='forms'");
  expect((await GET(request())).status).toBe(500); expect((await PATCH(request(defaultWebsiteCms()))).status).toBe(500);
  await pool.query("update cms_documents set data=$1 where key='forms'", [JSON.stringify(defaultCmsSnapshot.forms)]);
});
it.skipIf(!enabled)("the Website editor saves its narrow contract, retries failure and reloads stored content", async () => {
  const { chromium, expect: browserExpect } = await import("@playwright/test");
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const before = await protectedState(); let attempts = 0;
  try {
    await page.route("**/api/admin/**", async (route) => {
      const incoming = route.request();
      if (new URL(incoming.url()).pathname !== "/api/admin/cms") return route.fulfill({ json: { ok: true, data: [] } });
      if (incoming.method() === "PATCH") {
        expect(Object.keys(incoming.postDataJSON()).sort()).toEqual(["forms", "heroSlides", "pages", "settings"]);
        if (++attempts === 1) return route.abort("failed");
      }
      const response = incoming.method() === "PATCH" ? await PATCH(request(incoming.postDataJSON())) : await GET(request());
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });
    await page.goto("http://localhost:3001/admin/website?tab=global");
    const brand = page.getByLabel("Brand name", { exact: true });
    await brand.fill("Website boundary browser fixture");
    await page.getByRole("button", { name: "Save & publish", exact: true }).click();
    await browserExpect(page.getByRole("status")).toContainText("Your draft is still here");
    await browserExpect(brand).toHaveValue("Website boundary browser fixture");
    await page.getByRole("button", { name: "Save & publish", exact: true }).click();
    await browserExpect(page.getByRole("status")).toContainText("Published.");
    await page.reload(); await browserExpect(brand).toHaveValue("Website boundary browser fixture");
    expect(attempts).toBe(2); expect(await protectedState()).toEqual(before);
  } finally { await browser.close(); }
}, 60000);
it.skipIf(!enabled)("keeps inbox reads private and excludes booking updates with strict origin and input checks", async () => {
  const f = await inboxFixture(), before = await protectedState();
  const read = await inbox(request()); expect(read.status).toBe(200); expect(read.headers.get("cache-control")).toBe("private, no-store");
  expect((await read.json()).data.every((row: { formKey: string }) => row.formKey !== "booking")).toBe(true);
  expect((await inbox(request(undefined, undefined, "no"))).status).toBe(403);
  expect((await updateInbox(request(f.body, undefined, "no"))).status).toBe(403);
  expect((await updateInbox(request(f.body, "https://untrusted.example"))).status).toBe(403);
  expect((await updateInbox(request({ ...f.body, payload: {} }))).status).toBe(422);
  expect((await updateInbox(new Request("http://localhost:3001/api/admin/submissions", { method: "PATCH", headers: { origin: "http://localhost:3001", "x-fixture-admin": "yes" }, body: "{" }))).status).toBe(422);
  expect((await updateInbox(request({ ...f.body, id: randomUUID() }))).status).toBe(404);
  expect((await updateInbox(request({ ...f.body, id: f.booking.id }))).status).toBe(404);
  expect((await pool.query("select status from form_submissions where id=$1", [f.booking.id])).rows[0].status).toBe("new");
  expect(await protectedState()).toEqual(before);
});
it.skipIf(!enabled)("updates one inbox version atomically and rejects a competing stale review", async () => {
  const f = await inboxFixture();
  const replies = await Promise.all([updateInbox(request(f.body)), updateInbox(request({ ...f.body, status: "archived" }))]);
  expect(replies.map((r) => r.status).sort()).toEqual([200, 409]);
  const saved = (await replies.find((r) => r.ok)!.json()).data;
  expect(saved.updatedAt).not.toBe(f.body.updatedAt);
  expect((await pool.query("select status from form_submissions where id=$1", [f.contact.id])).rows[0].status).toBe(saved.status);
  const logs = (await pool.query("select action,metadata from audit_logs where entity_id=$1", [f.contact.id])).rows;
  expect(logs).toHaveLength(1); expect(logs[0].action).toBe("website.submission_status_updated");
  expect(JSON.stringify(logs)).not.toContain("inbox@example.test");
});
it.skipIf(!enabled)("rolls back an inbox status when its audit cannot be written", async () => {
  const f = await inboxFixture();
  await pool.query(`create function "${schema}".reject_inbox_audit() returns trigger language plpgsql as $$ begin if NEW.action='website.submission_status_updated' then raise exception 'fixture audit failure'; end if; return NEW; end $$`);
  await pool.query(`create trigger reject_inbox_audit before insert on "${schema}".audit_logs for each row execute function "${schema}".reject_inbox_audit()`);
  try {
    expect((await updateInbox(request(f.body))).status).toBe(500);
    expect((await pool.query("select status,updated_at from form_submissions where id=$1", [f.contact.id])).rows[0]).toEqual({ status: "new", updated_at: f.contact.updated_at });
  } finally { await pool.query(`drop trigger reject_inbox_audit on "${schema}".audit_logs`); }
});
it.skipIf(!enabled)("the Website inbox retains failed edits, refreshes stale records and persists a retry at three widths", async () => {
  const { chromium, expect: browserExpect } = await import("@playwright/test"); const browser = await chromium.launch();
  try { for (const width of [375, 1024, 1440]) {
    const f = await inboxFixture(), email = `inbox-${width}@example.test`;
    await pool.query("update form_submissions set payload=jsonb_set(payload,'{email}',to_jsonb($1::text)) where id=$2", [email, f.contact.id]);
    const page = await browser.newPage({ viewport: { width, height: 1000 } }); page.setDefaultTimeout(10000);
    let writes = 0, failNextRefresh = false; const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.route("**/api/admin/**", async (route) => {
        const outgoing = route.request(), path = new URL(outgoing.url()).pathname;
        let response: Response;
        if (path === "/api/admin/cms") response = await GET(request());
        else if (path === "/api/admin/submissions" && outgoing.method() === "PATCH") {
          writes++; if (writes === 1) return route.abort("failed");
          expect(Object.keys(outgoing.postDataJSON()).sort()).toEqual(["id", "status", "updatedAt"]);
          if (writes === 2) await pool.query("update form_submissions set status='archived',updated_at=updated_at+interval '1 second' where id=$1", [f.contact.id]);
          response = await updateInbox(request(outgoing.postDataJSON()));
        } else if (path === "/api/admin/submissions") {
          if (failNextRefresh) {
            failNextRefresh = false;
            return route.fulfill({ status: 503, json: { error: { message: "Fixture refresh unavailable." } } });
          }
          response = await inbox(request());
        } else throw new Error("Unexpected Website inbox API.");
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
      });
      await page.goto("http://localhost:3001/admin/website?tab=inbox");
      const select = page.getByLabel(`contact submission status from ${email}`, { exact: true });
      await select.selectOption("reviewed"); await browserExpect(page.locator('.cms-admin__notice[role="alert"]')).toBeVisible();
      await browserExpect(select).toHaveValue("new"); await browserExpect(select).toBeEnabled();
      await select.selectOption("reviewed"); await browserExpect(page.locator('.cms-admin__notice[role="alert"]')).toContainText("Refresh the inbox");
      await browserExpect(select).toHaveValue("new");
      failNextRefresh = true;
      await page.getByRole("button", { name: "Refresh inbox", exact: true }).click();
      await browserExpect(page.locator('.cms-admin__notice[role="alert"]')).toContainText("Fixture refresh unavailable"); await browserExpect(select).toHaveValue("new");
      await page.getByRole("button", { name: "Refresh inbox", exact: true }).click(); await browserExpect(select).toHaveValue("archived");
      await select.selectOption("reviewed"); await browserExpect(page.getByRole("status")).toContainText("Submission status saved");
      await page.reload(); await browserExpect(select).toHaveValue("reviewed");
      expect((await pool.query("select status from form_submissions where id=$1", [f.booking.id])).rows[0].status).toBe("new");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await select.evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Manrope");
      await page.screenshot({ path: `test-results/website-inbox-${width}.png` }); expect(errors).toEqual([]);
    } finally { await page.close(); }
  } } finally { await browser.close(); }
}, 60000);
