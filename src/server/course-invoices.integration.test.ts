import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { PDFDocument } from "pdf-lib";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
let database: ReturnType<typeof drizzle>;
vi.mock("@/server/db", () => ({ getDb: () => database }));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ api: { getSession: async ({ headers }: { headers: Headers }) => {
  const id = headers.get("x-fixture-user"); return id ? { user: { id, email: `${id}@example.test` } } : null;
} } }) }));
vi.mock("@/server/course-mail", () => ({ sendCourseMail: vi.fn(async () => ({ delivered: true })) }));
import { POST } from "@/app/api/admin/courses/invoices/route";
import { GET as adminSnapshot, PATCH } from "@/app/api/admin/courses/route";
import { sendCourseMail } from "@/server/course-mail";
import { GET as download } from "@/app/api/portal/downloads/[kind]/[id]/route";
import { GET as portal } from "@/app/api/portal/route";
const enabled = process.env.BOOKING_DB_TESTS === "1";
const fixtureSchema = `course_invoice_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool; let setupPool: Pool; let storage = ""; let pdf: Uint8Array<ArrayBuffer>;
const storageParent = path.join(process.cwd(), "storage");
const request = (form: FormData, actor = "invoice-admin", origin = "http://localhost:3001") => new Request("http://localhost:3001/api/admin/courses/invoices", { method: "POST", headers: { origin, ...(actor ? { "x-fixture-user": actor } : {}) }, body: form });
function form(registrationId: string, changes: Record<string, string> = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ registrationId, reference: randomUUID(), documentType: "invoice", amountCents: "12545", dueAt: "2097-09-05", notes: "Private fixture notes", ...changes })) result.set(key, value);
  result.set("file", new File([pdf], "invoice.pdf", { type: "application/pdf" })); return result;
}
beforeAll(async () => {
  if (!enabled) return;
  process.loadEnvFile(".env.local"); const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web" || !/^course_invoice_test_[a-f0-9]{32}$/.test(fixtureSchema)) throw new Error("Verified local fixture database required.");
  setupPool = new Pool({ connectionString: url.href }); await setupPool.query(`create schema "${fixtureSchema}"`);
  for (const table of ["course_registrations", "course_invoices", "course_payment_records", "profiles", "audit_logs", "courses", "course_offerings", "registration_participants", "organisations", "organisation_memberships", "course_certificates", "course_materials", "student_posts", "user"]) await setupPool.query(`create table "${fixtureSchema}"."${table}" (like public."${table}" including all)`);
  pool = new Pool({ connectionString: url.href, options: `-c search_path=${fixtureSchema},public` }); database = drizzle(pool);
  for (const [actor, role] of [["invoice-admin", "client_admin"], ["invoice-owner", "customer"], ["invoice-coordinator", "customer"], ["invoice-other", "customer"]]) await pool.query("insert into profiles(auth_user_id,display_name,role) values($1,'Invoice fixture',$2)", [actor, role]);
  await mkdir(storageParent, { recursive: true }); storage = await mkdtemp(path.join(storageParent, "invoice-test-")); vi.stubEnv("COURSE_STORAGE_DIR", storage);
  const document = await PDFDocument.create(); document.addPage(); pdf = new Uint8Array(await document.save());
});
afterAll(async () => {
  if (pool) await pool.end(); if (setupPool) { await setupPool.query(`drop schema if exists "${fixtureSchema}" cascade`); await setupPool.end(); }
  if (storage && path.dirname(path.resolve(storage)) === path.resolve(storageParent) && path.basename(storage).startsWith("invoice-test-")) await rm(storage, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
async function registration() { return (await pool.query("insert into course_registrations(offering_id,applicant_name,applicant_email,amount_due_cents) values($1,'Invoice applicant','invoice-owner@example.test',12545) returning id", [randomUUID()])).rows[0].id as string; }
const files = () => readdir(path.join(storage, "invoices")).catch(() => []);
const payment = (id: string, changes: Record<string, unknown> = {}, actor = "invoice-admin", origin = "http://localhost:3001") => PATCH(new Request("http://localhost:3001/api/admin/courses", { method: "PATCH", headers: { origin, "content-type": "application/json", ...(actor ? { "x-fixture-user": actor } : {}) }, body: JSON.stringify({ action: "payment", id, paymentStatus: "paid", paymentReference: "OFFLINE-TEST", ...changes }) }));
it.skipIf(!enabled)("requires administrator origin and strict metadata before saving a PDF", async () => {
  const id = await registration();
  expect((await POST(request(form(id), ""))).status).toBe(401);
  expect((await POST(request(form(id), "invoice-owner"))).status).toBe(403);
  expect((await POST(request(form(id), "invoice-admin", "https://untrusted.example"))).status).toBe(403);
  const invalid: Record<string, string>[] = [{ dueAt: "2097-02-30" }, { amountCents: "" }, { amountCents: "-1" }, { amountCents: "1.5" }, { amountCents: "2147483648" }, { extra: "ignored" }];
  for (const changes of invalid) expect((await POST(request(form(id, changes)))).status).toBe(422);
  const duplicate = form(id); duplicate.append("registrationId", randomUUID()); expect((await POST(request(duplicate))).status).toBe(422);
  expect((await POST(request(form(randomUUID())))).status).toBe(404);
  expect(await files()).toEqual([]);
});
it.skipIf(!enabled)("validates payment changes and serializes repeated offline status updates", async () => {
  const id = await registration(); vi.mocked(sendCourseMail).mockClear();
  expect((await payment(id, {}, "")).status).toBe(401); expect((await payment(id, {}, "invoice-owner")).status).toBe(403);
  expect((await payment(id, {}, "invoice-admin", "https://untrusted.example")).status).toBe(403);
  expect((await payment(id, { amountDueCents: 1 })).status).toBe(422);
  expect((await payment(randomUUID())).status).toBe(404);
  const responses = await Promise.all([payment(id), payment(id)]); expect(responses.map((response) => response.status)).toEqual([200, 200]);
  expect((await pool.query("select id from course_payment_records where registration_id=$1", [id])).rows).toHaveLength(1);
  expect((await pool.query("select id from audit_logs where entity_id=$1 and action='course.payment_updated'", [id])).rows).toHaveLength(1);
  expect(sendCourseMail).toHaveBeenCalledTimes(1);
  expect((await payment(id, { paymentStatus: "unpaid" })).status).toBe(409);
  expect((await pool.query("select payment_status,amount_due_cents from course_registrations where id=$1", [id])).rows[0]).toEqual({ payment_status: "paid", amount_due_cents: 12545 });
});
it.skipIf(!enabled)("rolls back manual payment changes when their audit write fails without notifying the applicant", async () => {
  const id = await registration(); vi.mocked(sendCourseMail).mockClear();
  await pool.query(`create function "${fixtureSchema}".reject_payment_audit() returns trigger language plpgsql as $$ begin if NEW.action = 'course.payment_updated' then raise exception 'fixture audit failure'; end if; return NEW; end $$`);
  await pool.query(`create trigger payment_audit_failure before insert on audit_logs for each row execute function "${fixtureSchema}".reject_payment_audit()`);
  try { expect((await payment(id)).status).toBe(500); } finally { await pool.query("drop trigger payment_audit_failure on audit_logs"); }
  expect((await pool.query("select payment_status from course_registrations where id=$1", [id])).rows[0].payment_status).toBe("unpaid");
  expect((await pool.query("select id from course_payment_records where registration_id=$1", [id])).rows).toHaveLength(0);
  expect(sendCourseMail).not.toHaveBeenCalled();
});
it.skipIf(!enabled)("reports notification failure without losing or repeating a committed payment update", async () => {
  const id = await registration(); vi.mocked(sendCourseMail).mockClear(); vi.mocked(sendCourseMail).mockResolvedValueOnce({ delivered: false });
  const response = await payment(id); expect(response.status).toBe(200); expect((await response.json()).message).toContain("saved, but the notification email was not delivered");
  expect((await payment(id)).status).toBe(200); expect(sendCourseMail).toHaveBeenCalledTimes(1);
  expect((await pool.query("select id from course_payment_records where registration_id=$1", [id])).rows).toHaveLength(1);
});
it.skipIf(!enabled)("keeps an invoice, payment update and audit atomic and removes provisional files on rollback", async () => {
  const id = await registration(); const beforeFiles = await files();
  await pool.query(`create function "${fixtureSchema}".reject_invoice_audit() returns trigger language plpgsql as $$ begin if NEW.action = 'course.invoice_uploaded' then raise exception 'fixture audit failure'; end if; return NEW; end $$`);
  await pool.query(`create trigger invoice_audit_failure before insert on audit_logs for each row execute function "${fixtureSchema}".reject_invoice_audit()`);
  try { expect((await POST(request(form(id)))).status).toBe(500); } finally { await pool.query("drop trigger invoice_audit_failure on audit_logs"); }
  expect((await pool.query("select id from course_invoices where registration_id=$1", [id])).rows).toHaveLength(0);
  expect((await pool.query("select id from course_payment_records where registration_id=$1", [id])).rows).toHaveLength(0);
  expect((await pool.query("select payment_status,amount_due_cents from course_registrations where id=$1", [id])).rows[0]).toEqual({ payment_status: "unpaid", amount_due_cents: 12545 });
  expect(await files()).toEqual(beforeFiles);
});
it.skipIf(!enabled)("stores private PDFs and rejects duplicate references without leaking paths or files", async () => {
  const id = await registration(); const reference = randomUUID();
  const response = await POST(request(form(id, { reference }))); expect(response.status).toBe(201);
  const result = await response.json(); expect(result.data.storageKey).toBeUndefined();
  const beforeFiles = await files(); expect((await POST(request(form(id, { reference })))).status).toBe(409);
  expect(await files()).toEqual(beforeFiles);
  expect((await pool.query("select id from course_invoices where registration_id=$1", [id])).rows).toHaveLength(1);
});
it.skipIf(!enabled)("keeps invoice and receipt evidence separate from the registration total and explicit payment status", async () => {
  const id = await registration();
  expect((await POST(request(form(id, { documentType: "invoice", amountCents: "19000" })))).status).toBe(201);
  expect((await pool.query("select payment_status,amount_due_cents,payment_reference from course_registrations where id=$1", [id])).rows[0]).toEqual({ payment_status: "unpaid", amount_due_cents: 12545, payment_reference: null });
  expect((await pool.query("select id from course_payment_records where registration_id=$1", [id])).rows).toHaveLength(0);

  expect((await payment(id)).status).toBe(200);
  expect((await POST(request(form(id, { documentType: "receipt", amountCents: "4000" })))).status).toBe(201);
  expect((await pool.query("select payment_status,amount_due_cents,payment_reference from course_registrations where id=$1", [id])).rows[0]).toEqual({ payment_status: "paid", amount_due_cents: 12545, payment_reference: "OFFLINE-TEST" });
  expect((await pool.query("select status,amount_cents from course_payment_records where registration_id=$1", [id])).rows).toEqual([{ status: "paid", amount_cents: 12545 }]);
  expect((await pool.query("select action from audit_logs where entity_type='course_invoice' and entity_id in (select id::text from course_invoices where registration_id=$1) order by action", [id])).rows).toEqual([{ action: "course.invoice_uploaded" }, { action: "course.receipt_uploaded" }]);
});
it.skipIf(!enabled)("rejects oversized and mismatched PDFs before any database or file changes", async () => {
  const id = await registration(); const before = await files();
  const oversized = request(form(id)); oversized.headers.set("content-length", String(26 * 1024 * 1024));
  expect((await POST(oversized)).status).toBe(422);
  for (const file of [new File(["Not a PDF"], "invoice.pdf", { type: "application/pdf" }), new File([pdf], "invoice.txt", { type: "application/pdf" }), new File([], "invoice.pdf", { type: "application/pdf" })]) {
    const body = form(id); body.set("file", file); expect((await POST(request(body))).status).toBe(422);
  }
  expect(await files()).toEqual(before);
  expect((await pool.query("select id from course_invoices where registration_id=$1", [id])).rows).toHaveLength(0);
});
it.skipIf(!enabled)("keeps invoice and receipt downloads private to their registration and organisation", async () => {
  const id = await registration(); const courseId = randomUUID(); const organisationId = randomUUID();
  const offeringId = (await pool.query("select offering_id from course_registrations where id=$1", [id])).rows[0].offering_id;
  await pool.query("insert into courses(id,slug,title,summary,description) values($1,$2,'Invoice course','Fixture','Fixture')", [courseId, courseId]);
  await pool.query("insert into course_offerings(id,course_id,code,starts_at,ends_at,delivery_mode,currency) values($1,$2,$3,'2097-10-01','2097-10-02','virtual','CAD')", [offeringId, courseId, randomUUID()]);
  await pool.query("insert into organisations(id,name) values($1,'Invoice fixture organisation')", [organisationId]);
  await pool.query("update course_registrations set organisation_id=$1 where id=$2", [organisationId, id]);
  await pool.query("insert into registration_participants(registration_id,offering_id,profile_id,name,email,email_normalized) select $1,$2,id,'Invoice owner','owner@example.test','owner@example.test' from profiles where auth_user_id='invoice-owner'", [id, offeringId]);
  for (const [actor, organisation] of [["invoice-coordinator", organisationId], ["invoice-other", randomUUID()]]) await pool.query("insert into organisation_memberships(organisation_id,profile_id,role) select $1,id,'coordinator' from profiles where auth_user_id=$2", [organisation, actor]);
  for (const kind of ["invoice", "receipt"]) {
    const uploaded = await POST(request(form(id, { documentType: kind }))); expect(uploaded.status).toBe(201); const document = (await uploaded.json()).data;
    const get = (actor: string, fileKind = kind) => download(new Request("http://localhost:3001/api/portal/downloads", { headers: actor ? { "x-fixture-user": actor } : {} }), { params: Promise.resolve({ kind: fileKind, id: document.id }) });
    expect((await get("")).status).toBe(401); expect((await get("invoice-other")).status).toBe(403);
    expect((await get("invoice-owner", kind === "invoice" ? "receipt" : "invoice")).status).toBe(404);
    for (const actor of ["invoice-admin", "invoice-owner", "invoice-coordinator"]) {
      const response = await get(actor); expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("content-disposition")).toContain("attachment;"); expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from(pdf));
    }
    await pool.query("update profiles set active=false where auth_user_id='invoice-owner'");
    try { expect((await get("invoice-owner")).status).toBe(403); } finally { await pool.query("update profiles set active=true where auth_user_id='invoice-owner'"); }
  }
  for (const [actor, suffix, expected] of [["invoice-owner", "?scope=profile", 2], ["invoice-coordinator", "", 2], ["invoice-coordinator", "?scope=profile", 0], ["invoice-other", "", 0]] as const) {
    const response = await portal(new Request(`http://localhost:3001/api/portal${suffix}`, { headers: { "x-fixture-user": actor } })); expect(response.status).toBe(200);
    const result = await response.json(); expect(result.data.invoices).toHaveLength(expected);
    for (const invoice of result.data.invoices) { expect(invoice.storageKey).toBeUndefined(); expect(invoice.notes).toBeUndefined(); }
  }
});
it.skipIf(!enabled)("uploads exact cents from the actual admin form and retains invoice state after reload", async () => {
  const { chromium } = await import("@playwright/test"); const browser = await chromium.launch();
  const offeringId = (await pool.query("select id from course_offerings limit 1")).rows[0].id;
  try {
    for (const width of [375, 1440]) {
      const name = `Invoice browser ${width}`;
      const id = (await pool.query("insert into course_registrations(offering_id,applicant_name,applicant_email,amount_due_cents) values($1,$2,'owner@example.test',12545) returning id", [offeringId, name])).rows[0].id;
      await pool.query("insert into registration_participants(registration_id,offering_id,name,email,email_normalized) values($1,$2,$3,$4,$4)", [id, offeringId, name, `${randomUUID()}@example.test`]);
      const page = await browser.newPage({ viewport: { width, height: 950 } }); page.setDefaultTimeout(10000);
      const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.route("**/api/admin/**", async (route) => {
          const path = new URL(route.request().url()).pathname;
          const headers = new Headers(route.request().headers()); headers.set("x-fixture-user", "invoice-admin");
          let response: Response;
          if (path === "/api/admin/courses/invoices") response = await POST(new Request(route.request().url(), { method: "POST", headers, body: new Uint8Array(route.request().postDataBuffer()!) }));
          else if (path === "/api/admin/courses") response = await adminSnapshot(new Request(route.request().url(), { headers }));
          else { await route.fulfill({ json: { ok: true } }); return; }
          await route.fulfill({ status: response.status, body: await response.text(), contentType: "application/json" });
        });
        await page.goto("http://localhost:3001/admin/courses");
        const formElement = page.locator("form").filter({ has: page.getByRole("heading", { name: "Assign payment document" }) });
        await formElement.getByRole("combobox", { name: "Registration", exact: true }).selectOption(id);
        await formElement.getByLabel("Reference", { exact: true }).fill(`BROWSER-${width}`);
        await formElement.getByLabel("Amount (CAD)", { exact: true }).fill("125.45");
        await formElement.getByLabel("PDF file").setInputFiles({ name: "invoice.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdf) });
        await formElement.getByRole("button", { name: "Upload document", exact: true }).click();
        await expect.poll(() => page.getByRole("status").textContent()).toContain("Payment document assigned");
        expect((await pool.query("select amount_cents,reference from course_invoices where registration_id=$1", [id])).rows).toEqual([{ amount_cents: 12545, reference: `BROWSER-${width}` }]);
        await page.reload(); await expect.poll(() => page.getByLabel(`Payment status for ${name}`, { exact: true }).inputValue()).toBe("unpaid");
        expect(errors).toEqual([]);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
}, 60000);
