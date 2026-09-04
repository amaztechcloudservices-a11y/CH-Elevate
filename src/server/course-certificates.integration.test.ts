import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
let database: ReturnType<typeof drizzle>;
vi.mock("@/server/db", () => ({ getDb: () => database }));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ api: { getSession: async ({ headers }: { headers: Headers }) => {
  const id = headers.get("x-fixture-user"); return id ? { user: { id, email: `${id}@example.test` } } : null;
} } }) }));
vi.mock("@/server/course-mail", () => ({ sendCourseMail: vi.fn(async () => ({ delivered: true })) }));
import { sendCourseMail } from "./course-mail";
import { GET as adminSnapshot, PATCH } from "@/app/api/admin/courses/route";
import { GET as verify } from "@/app/api/certificates/verify/route";
import { GET as download } from "@/app/api/portal/downloads/[kind]/[id]/route";
import { GET as portal } from "@/app/api/portal/route";
const enabled = process.env.BOOKING_DB_TESTS === "1";
const fixtureSchema = `course_cert_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool; let setupPool: Pool;
const ownerId = randomUUID(); const otherId = randomUUID();
const request = (body?: object, actor = "cert-admin", origin = "http://localhost:3001") => new Request("http://localhost:3001/api/admin/courses", { method: body ? "PATCH" : "GET", headers: { origin, ...(actor ? { "x-fixture-user": actor } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
const check = async (number: string) => (await verify(new Request(`http://localhost:3001/api/certificates/verify?number=${number}`))).json();
const file = (id: string, actor = "cert-owner") => download(request(undefined, actor), { params: Promise.resolve({ kind: "certificate", id }) });
beforeAll(async () => {
  if (!enabled) return;
  process.loadEnvFile(".env.local"); const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web" || !/^course_cert_test_[a-f0-9]{32}$/.test(fixtureSchema)) throw new Error("Verified local fixture database required.");
  setupPool = new Pool({ connectionString: url.href }); await setupPool.query(`create schema "${fixtureSchema}"`);
  for (const table of ["courses", "course_offerings", "course_registrations", "registration_participants", "course_certificates", "profiles", "user", "audit_logs", "organisation_memberships", "organisations", "account_invitations", "course_materials", "course_invoices", "student_posts"]) await setupPool.query(`create table "${fixtureSchema}"."${table}" (like public."${table}" including all)`);
  pool = new Pool({ connectionString: url.href, options: `-c search_path=${fixtureSchema},public` }); database = drizzle(pool);
  for (const [id, actor, role] of [[randomUUID(), "cert-admin", "client_admin"], [ownerId, "cert-owner", "customer"], [otherId, "cert-other", "customer"]]) await pool.query("insert into profiles(id,auth_user_id,display_name,role) values($1,$2,'Local certificate fixture',$3)", [id, actor, role]);
});
afterAll(async () => { if (pool) await pool.end(); if (setupPool) { await setupPool.query(`drop schema if exists "${fixtureSchema}" cascade`); await setupPool.end(); } });
async function fixture() {
  const courseId = (await pool.query("insert into courses(slug,title,summary,description) values($1,'Course certificate fixture','Local fixture summary','Local fixture description') returning id", [randomUUID()])).rows[0].id;
  const offeringId = (await pool.query("insert into course_offerings(course_id,code,starts_at,ends_at,delivery_mode) values($1,$2,'2097-09-04','2097-09-05','virtual') returning id", [courseId, randomUUID()])).rows[0].id;
  const registrationId = (await pool.query("insert into course_registrations(offering_id,applicant_name,applicant_email,status) values($1,'Fixture applicant','cert-owner@example.test','approved') returning id", [offeringId])).rows[0].id;
  const participantId = (await pool.query("insert into registration_participants(registration_id,offering_id,profile_id,name,email,email_normalized,status) values($1,$2,$3,'Fixture student','cert-owner@example.test','cert-owner@example.test','approved') returning id", [registrationId, offeringId, ownerId])).rows[0].id;
  return { courseId, offeringId, registrationId, participantId };
}
const attendance = (participantId: string, complete = true, value = "attended") => PATCH(request({ action: "attendance", participantIds: [participantId], attendance: value, complete }));
const issue = (participantId: string) => PATCH(request({ action: "certificate", participantId }));

it.skipIf(!enabled)("completion correction invalidates certificates across verification, download and student profile", async () => {
  const { participantId } = await fixture();
  expect((await attendance(participantId)).status).toBe(200);
  const response = await issue(participantId); expect(response.status).toBe(200); const certificate = (await response.json()).data;
  expect((await check(certificate.certificateNumber)).data.valid).toBe(true);
  expect((await file(certificate.id)).status).toBe(200);
  expect((await attendance(participantId, false, "no_show")).status).toBe(200);
  expect((await pool.query("select status,completed_at from registration_participants where id=$1", [participantId])).rows[0]).toEqual({ status: "approved", completed_at: null });
  expect((await check(certificate.certificateNumber)).data.valid).toBe(false);
  expect((await file(certificate.id)).status).toBe(403);
  expect((await (await portal(request(undefined, "cert-owner"))).json()).data.certificates.some((row: { id: string }) => row.id === certificate.id)).toBe(false);
  expect((await issue(participantId)).status).toBe(409);
});
it.skipIf(!enabled)("issuance requires same-origin admin access and is idempotent", async () => {
  const { participantId } = await fixture(); await attendance(participantId);
  const data = { action: "certificate", participantId };
  expect((await PATCH(request(data, ""))).status).toBe(401);
  expect((await PATCH(request(data, "cert-owner"))).status).toBe(403);
  expect((await PATCH(request(data, "cert-admin", "https://untrusted.example"))).status).toBe(403);
  const before = vi.mocked(sendCourseMail).mock.calls.length;
  const results = await Promise.all([issue(participantId), issue(participantId)]);
  for (const response of results) expect(response.status).toBe(200);
  const certificates = await Promise.all(results.map((response) => response.json()));
  expect(certificates[0].data.id).toBe(certificates[1].data.id);
  expect(vi.mocked(sendCourseMail).mock.calls.length - before).toBe(1);
  expect((await pool.query("select id from audit_logs where entity_id=$1 and action='course.certificate_issued'", [certificates[0].data.id])).rows).toHaveLength(1);
});
it.skipIf(!enabled)("whole-registration completion records eligibility rather than only changing the status label", async () => {
  const { participantId, registrationId } = await fixture();
  await attendance(participantId, false);
  expect((await PATCH(request({ action: "registration_status", id: registrationId, status: "completed" }))).status).toBe(200);
  expect((await pool.query("select completed_at from registration_participants where id=$1", [participantId])).rows[0].completed_at).toBeInstanceOf(Date);
  expect((await issue(participantId)).status).toBe(200);
});

it.skipIf(!enabled)("checks current eligibility for legacy certificates and denies another student's download", async () => {
  const { participantId } = await fixture(); await attendance(participantId);
  const certificate = (await (await issue(participantId)).json()).data;
  expect((await file(certificate.id, "")).status).toBe(401);
  expect((await file(certificate.id, "cert-other")).status).toBe(403);
  expect((await file(certificate.id, "cert-admin")).status).toBe(200);
  await pool.query("update registration_participants set status='cancelled' where id=$1", [participantId]);
  expect((await check(certificate.certificateNumber)).data.valid).toBe(false);
  expect((await file(certificate.id)).status).toBe(403);
  expect((await (await portal(request(undefined, "cert-owner"))).json()).data.certificates.some((row: { id: string }) => row.id === certificate.id)).toBe(false);
  expect((await issue(participantId)).status).toBe(409);
});

it.skipIf(!enabled)("retains completion dates on retries and refreshes certificate snapshots only after a new completion", async () => {
  const { participantId, registrationId } = await fixture(); await attendance(participantId);
  const certificate = (await (await issue(participantId)).json()).data;
  await attendance(participantId);
  expect((await pool.query("select completed_at from registration_participants where id=$1", [participantId])).rows[0].completed_at.toISOString()).toBe(certificate.completedAt);
  expect((await check(certificate.certificateNumber)).data.valid).toBe(true);
  expect((await PATCH(request({ action: "registration_status", id: registrationId, status: "cancelled" }))).status).toBe(200);
  expect((await check(certificate.certificateNumber)).data.valid).toBe(false);
  expect((await PATCH(request({ action: "registration_status", id: registrationId, status: "approved" }))).status).toBe(200);
  await pool.query("update registration_participants set name='Corrected student name' where id=$1", [participantId]);
  await attendance(participantId);
  const reissued = (await (await issue(participantId)).json()).data;
  expect(reissued.id).toBe(certificate.id); expect(reissued.participantName).toBe("Corrected student name");
  expect(reissued.completedAt).not.toBe(certificate.completedAt);
  expect(reissued.revokedAt).toBeNull(); expect((await check(certificate.certificateNumber)).data.valid).toBe(true);
});

it.skipIf(!enabled)("serializes issuance with attendance correction and rejects malformed or incomplete selections", async () => {
  const { participantId, offeringId } = await fixture();
  expect((await issue(participantId)).status).toBe(409);
  const valid = { action: "attendance", participantIds: [participantId], attendance: "attended", complete: true };
  expect((await PATCH(request({ ...valid, completedAt: "2097-01-01" }))).status).toBe(422);
  expect((await PATCH(request({ ...valid, participantIds: [participantId, randomUUID()] }))).status).toBe(404);
  expect((await pool.query("select completed_at from registration_participants where id=$1", [participantId])).rows[0].completed_at).toBeNull();
  expect((await PATCH(request(valid, "cert-admin", "https://untrusted.example"))).status).toBe(403);
  expect((await PATCH(request({ ...valid, attendance: "no_show" }))).status).toBe(422);
  expect((await PATCH(request({ action: "certificate", participantId, participantName: "Forged name" }))).status).toBe(422);
  await pool.query("update profiles set active=false where auth_user_id='cert-admin'");
  try { expect((await issue(participantId)).status).toBe(403); } finally { await pool.query("update profiles set active=true where auth_user_id='cert-admin'"); }
  await attendance(participantId);
  const raced = await Promise.all([issue(participantId), attendance(participantId, false)]);
  expect([200, 409]).toContain(raced[0].status); expect(raced[1].status).toBe(200);
  expect((await pool.query("select id from course_certificates where participant_id=$1 and revoked_at is null", [participantId])).rows).toHaveLength(0);
  await pool.query("update course_offerings set is_cancelled=true where id=$1", [offeringId]);
  expect((await attendance(participantId)).status).toBe(409); expect((await issue(participantId)).status).toBe(409);
});

it.skipIf(!enabled)("admin attendance and certificate controls persist through reload and correction on mobile and desktop", async () => {
  const { chromium } = await import("@playwright/test"); const browser = await chromium.launch();
  try {
    for (const width of [375, 1440]) {
      const { participantId } = await fixture(); const name = `Attendance browser ${width}`;
      await pool.query("update registration_participants set name=$1 where id=$2", [name, participantId]);
      const page = await browser.newPage({ viewport: { width, height: 950 } });
      page.setDefaultTimeout(10000);
      try {
        await page.route("**/api/admin/**", async (route) => {
          if (new URL(route.request().url()).pathname === "/api/admin/courses") {
            const response = route.request().method() === "GET" ? await adminSnapshot(request()) : await PATCH(request(route.request().postDataJSON()));
            await route.fulfill({ status: response.status, body: await response.text(), contentType: "application/json" }); return;
          }
          await route.fulfill({ json: { ok: true } });
        });
        await page.goto("http://localhost:3001/admin/courses");
        const row = page.getByRole("row").filter({ hasText: name });
        const select = page.getByLabel(`Attendance for ${name}`, { exact: true });
        await expect.poll(() => row.getByRole("button", { name: "Issue", exact: true }).count()).toBe(0);
        await select.selectOption("attended");
        await expect.poll(() => row.getByRole("button", { name: "Issue", exact: true }).count()).toBe(1);
        await row.getByRole("button", { name: "Issue", exact: true }).click();
        await expect.poll(async () => (await pool.query("select count(*)::int as count from course_certificates where participant_id=$1 and revoked_at is null", [participantId])).rows[0].count).toBe(1);
        await page.reload(); await expect.poll(() => select.inputValue()).toBe("attended");
        await select.selectOption("no_show");
        await expect.poll(() => row.getByRole("button", { name: "Issue", exact: true }).count()).toBe(0);
        expect((await pool.query("select status,completed_at from registration_participants where id=$1", [participantId])).rows[0]).toEqual({ status: "approved", completed_at: null });
        expect((await pool.query("select revoked_at from course_certificates where participant_id=$1", [participantId])).rows[0].revoked_at).toBeInstanceOf(Date);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
}, 60000);
