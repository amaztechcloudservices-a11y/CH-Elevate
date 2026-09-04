import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

let database: ReturnType<typeof drizzle>;
vi.mock("@/server/db", () => ({ getDb: () => database }));
vi.mock("@/server/course-mail", () => ({ sendCourseMail: vi.fn(async () => ({ delivered: true })) }));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ api: { getSession: async ({ headers }: { headers: Headers }) => {
  const id = headers.get("x-fixture-user"); return id ? { user: { id, email: `${id}@example.test` } } : null;
} } }) }));
import { GET, PATCH } from "@/app/api/portal/route";
import { GET as adminSnapshot, PATCH as adminUpdate } from "@/app/api/admin/courses/route";
const enabled = process.env.BOOKING_DB_TESTS === "1";
const fixtureSchema = `course_coord_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool; let setupPool: Pool;
const request = (body: object, actor = "coordinator", origin = "http://localhost:3001") => new Request("http://localhost:3001/api/portal", { method: "PATCH", headers: { origin, ...(actor ? { "x-fixture-user": actor } : {}) }, body: JSON.stringify(body) });
beforeAll(async () => {
  if (!enabled) return; process.loadEnvFile(".env.local"); const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web" || !/^course_coord_test_[a-f0-9]{32}$/.test(fixtureSchema)) throw new Error("Verified local fixture database required.");
  setupPool = new Pool({ connectionString: url.href }); await setupPool.query(`create schema "${fixtureSchema}"`);
  for (const table of ["courses", "course_offerings", "course_registrations", "registration_participants", "organisations", "organisation_memberships", "account_invitations", "profiles", "audit_logs", "course_materials", "course_certificates", "course_invoices", "course_payment_records", "student_posts", "user"]) await setupPool.query(`create table "${fixtureSchema}"."${table}" (like public."${table}" including all)`);
  pool = new Pool({ connectionString: url.href, options: `-c search_path=${fixtureSchema},public` }); database = drizzle(pool);
  for (const [actor, role] of [["coordinator", "customer"], ["student", "customer"], ["unrelated", "customer"], ["admin", "client_admin"]]) await pool.query("insert into profiles(auth_user_id,display_name,role) values($1,'Coordinator fixture',$2)", [actor, role]);
});
it.skipIf(!enabled)("real roster replacement and admin review persist after reload on mobile and desktop", async () => {
  const { chromium } = await import("@playwright/test"); const browser = await chromium.launch();
  try {
    for (const width of [375, 1440]) {
      const f = await fixture(); const name = `Browser replacement ${width}`;
      const retained = (await pool.query("select * from registration_participants where id=$1", [f.retainedId])).rows[0];
      const page = await browser.newPage({ viewport: { width, height: 1100 } }); page.setDefaultTimeout(10000);
      const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.route("**/api/portal", async (route) => {
          const incoming = new Request(route.request().url(), { method: route.request().method(), headers: { origin: "http://localhost:3001", "x-fixture-user": "coordinator" }, ...(route.request().method() === "PATCH" ? { body: route.request().postData()! } : {}) });
          const response = incoming.method === "PATCH" ? await PATCH(incoming) : await GET(incoming);
          await route.fulfill({ status: response.status, body: await response.text(), contentType: "application/json" });
        });
        await page.route("**/api/admin/**", async (route) => {
          if (new URL(route.request().url()).pathname !== "/api/admin/courses") return route.fulfill({ json: { ok: true, data: {} } });
          const incoming = new Request(route.request().url(), { method: route.request().method(), headers: { origin: "http://localhost:3001", "x-fixture-user": "admin" }, ...(route.request().method() === "PATCH" ? { body: route.request().postData()! } : {}) });
          const response = incoming.method === "PATCH" ? await adminUpdate(incoming) : await adminSnapshot(incoming);
          await route.fulfill({ status: response.status, body: await response.text(), contentType: "application/json" });
        });
        await page.goto("http://localhost:3001/portal"); const roster = page.locator("#organisation");
        await roster.getByLabel("Organisation course registration").selectOption(f.registrationId);
        await roster.getByRole("button", { name: "Replace Old student", exact: true }).click();
        await roster.getByLabel("Replacement full name").fill(name); await roster.getByLabel("Replacement email").fill(f.body.email);
        await roster.getByRole("button", { name: "Submit replacement" }).click();
        await expect.poll(() => roster.getByText(name, { exact: true }).count(), { timeout: 10000 }).toBe(1);
        await page.reload(); await roster.getByLabel("Organisation course registration").selectOption(f.registrationId);
        await expect.poll(() => roster.getByText(name, { exact: true }).count(), { timeout: 10000 }).toBe(1);
        await page.goto("http://localhost:3001/admin/courses");
        const review = page.getByLabel(`Registration status for ${name}`, { exact: true });
        await expect.poll(() => review.inputValue(), { timeout: 10000 }).toBe("pending_review");
        await review.selectOption("approved");
        await expect.poll(async () => (await pool.query("select status from registration_participants where id=$1", [f.participantId])).rows[0].status, { timeout: 10000 }).toBe("approved");
        await page.reload(); await expect.poll(() => review.inputValue(), { timeout: 10000 }).toBe("approved");
        expect((await pool.query("select * from registration_participants where id=$1", [f.retainedId])).rows[0]).toEqual(retained);
        expect((await pool.query("select revoked_at from course_certificates where participant_id=$1", [f.retainedId])).rows[0].revoked_at).toBeNull();
        expect(errors).toEqual([]);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
}, 60000);
it.skipIf(!enabled)("enforces cutoffs, terminal states, duplicates and concurrent replacements", async () => {
  for (const state of ["cutoff", "started", "offering_cancelled", "registration_cancelled", "completed", "duplicate"]) {
    const f = await fixture();
    if (state === "cutoff") await pool.query("update course_offerings set substitution_cutoff_at=now()-interval '1 second' where id=$1", [f.offeringId]);
    if (state === "started") await pool.query("update course_offerings set starts_at=now()-interval '1 second' where id=$1", [f.offeringId]);
    if (state === "offering_cancelled") await pool.query("update course_offerings set is_cancelled=true where id=$1", [f.offeringId]);
    if (state === "registration_cancelled") await pool.query("update course_registrations set status='cancelled' where id=$1", [f.registrationId]);
    if (state === "completed") await pool.query("update registration_participants set status='completed' where id=$1", [f.participantId]);
    if (state === "duplicate") f.body.email = `${f.retainedId}@example.test`;
    expect((await PATCH(request(f.body))).status, state).toBe(409);
    expect((await pool.query("select name from registration_participants where id=$1", [f.participantId])).rows[0].name).toBe("Old student");
  }
  const f = await fixture();
  const responses = await Promise.all([PATCH(request(f.body)), PATCH(request({ ...f.body, email: `other-${randomUUID()}@example.test` }))]);
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  expect((await pool.query("select id from audit_logs where entity_id=$1 and action='course.participant_replaced'", [f.participantId])).rows).toHaveLength(1);
});
it.skipIf(!enabled)("rolls back replacement, revocations and history if the audit cannot be stored", async () => {
  const f = await fixture();
  await pool.query(`create function "${fixtureSchema}".reject_change_audit() returns trigger language plpgsql as $$ begin if NEW.action = 'course.participant_replaced' then raise exception 'fixture audit failure'; end if; return NEW; end $$`);
  await pool.query(`create trigger change_audit_failure before insert on audit_logs for each row execute function "${fixtureSchema}".reject_change_audit()`);
  try { expect((await PATCH(request(f.body))).status).toBe(500); } finally { await pool.query("drop trigger change_audit_failure on audit_logs"); }
  expect((await pool.query("select * from registration_participants where id=$1", [f.participantId])).rows[0]).toEqual(f.before);
  expect((await pool.query("select revoked_at from course_certificates where participant_id=$1", [f.participantId])).rows[0].revoked_at).toBeNull();
  expect((await pool.query("select revoked_at from account_invitations where participant_id=$1", [f.participantId])).rows[0].revoked_at).toBeNull();
});
it.skipIf(!enabled)("reviews new seats within capacity without demoting completed group members", async () => {
  const f = await fixture(); const retained = (await pool.query("select * from registration_participants where id=$1", [f.retainedId])).rows[0];
  const added = await PATCH(request({ action: "add_participant", registrationId: f.registrationId, name: "Additional student", email: `${randomUUID()}@example.test` }));
  expect(added.status).toBe(200); const participantId = (await added.json()).data.id;
  expect((await pool.query("select amount_due_cents,payment_status from course_registrations where id=$1", [f.registrationId])).rows[0]).toEqual({ amount_due_cents: 37500, payment_status: "partially_paid" });
  expect((await pool.query("select status,amount_cents from course_payment_records where registration_id=$1", [f.registrationId])).rows).toEqual([{ status: "partially_paid", amount_cents: 37500 }]);
  const review = (status: string, id = participantId) => adminUpdate(new Request("http://localhost:3001/api/admin/courses", { method: "PATCH", headers: { origin: "http://localhost:3001", "x-fixture-user": "admin" }, body: JSON.stringify({ action: "registration_status", id: f.registrationId, participantId: id, status }) }));
  const full = await review("approved"); expect(full.status).toBe(200); expect((await full.json()).message).toContain("Course-wide enrolment limit");
  expect((await pool.query("select status from registration_participants where id=$1", [participantId])).rows[0].status).toBe("waitlisted");
  expect((await review("approved", randomUUID())).status).toBe(404);
  expect((await review("rejected")).status).toBe(200);
  expect((await pool.query("select status from course_registrations where id=$1", [f.registrationId])).rows[0].status).toBe("approved");
  expect((await pool.query("select * from registration_participants where id=$1", [f.retainedId])).rows[0]).toEqual(retained);
  expect((await pool.query("select revoked_at from course_certificates where participant_id=$1", [f.retainedId])).rows[0].revoked_at).toBeNull();
  expect((await review("cancelled", f.participantId)).status).toBe(200);
  expect((await review("approved")).status).toBe(200);
  expect((await pool.query("select status from registration_participants where id=$1", [participantId])).rows[0].status).toBe("approved");
});
it.skipIf(!enabled)("rejects an added seat when its fee would overflow the supported registration total", async () => {
  const f = await fixture();
  await pool.query("update course_registrations set amount_due_cents=2147483647 where id=$1", [f.registrationId]);
  const before = (await pool.query("select count(*)::int as count from registration_participants where registration_id=$1", [f.registrationId])).rows[0].count;
  const response = await PATCH(request({ action: "add_participant", registrationId: f.registrationId, name: "Overflow student", email: `${randomUUID()}@example.test` }));
  expect(response.status).toBe(409);
  expect((await response.json()).error.message).toContain("exceed the supported registration total");
  expect((await pool.query("select amount_due_cents,payment_status from course_registrations where id=$1", [f.registrationId])).rows[0]).toEqual({ amount_due_cents: 2147483647, payment_status: "paid" });
  expect((await pool.query("select count(*)::int as count from registration_participants where registration_id=$1", [f.registrationId])).rows[0].count).toBe(before);
  expect((await pool.query("select count(*)::int as count from course_payment_records where registration_id=$1", [f.registrationId])).rows[0].count).toBe(0);
});
afterAll(async () => { if (pool) await pool.end(); if (setupPool) { await setupPool.query(`drop schema if exists "${fixtureSchema}" cascade`); await setupPool.end(); } });
async function fixture() {
  const courseId = randomUUID(), offeringId = randomUUID(), registrationId = randomUUID(), organisationId = randomUUID(), participantId = randomUUID(), retainedId = randomUUID();
  await pool.query("insert into courses(id,slug,title,summary,description,enrollment_limit) values($1,$2,'Coordinator course','Fixture','Fixture',2)", [courseId, courseId]);
  await pool.query("insert into course_offerings(id,course_id,code,starts_at,ends_at,delivery_mode,fee_cents) values($1,$2,$3,'2097-10-01','2097-10-02','virtual',12500)", [offeringId, courseId, offeringId]);
  await pool.query("insert into organisations(id,name) values($1,'Coordinator organisation')", [organisationId]);
  await pool.query("insert into organisation_memberships(organisation_id,profile_id,role) select $1,id,'coordinator' from profiles where auth_user_id='coordinator'", [organisationId]);
  await pool.query("insert into course_registrations(id,offering_id,organisation_id,applicant_name,applicant_email,status,amount_due_cents,payment_status) values($1,$2,$3,'Coordinator','coordinator@example.test','approved',25000,'paid')", [registrationId, offeringId, organisationId]);
  for (const [id, name, status] of [[participantId, "Old student", "approved"], [retainedId, "Retained student", "completed"]]) {
    await pool.query("insert into registration_participants(id,registration_id,offering_id,profile_id,name,email,email_normalized,status,attendance,completed_at,cancellation_requested_at) select $1,$2,$3,id,$4,$5,$5,$6,'attended','2096-01-01','2096-01-01' from profiles where auth_user_id='student'", [id, registrationId, offeringId, name, `${id}@example.test`, status]);
    await pool.query("insert into course_certificates(participant_id,certificate_number,participant_name,course_title,completed_at) values($1,$2,$3,'Coordinator course','2096-01-01')", [id, id, name]);
  }
  await pool.query("insert into account_invitations(registration_id,participant_id,email,token_hash,expires_at) values($1,$2,'old@example.test',$3,now()+interval '1 day')", [registrationId, participantId, randomUUID()]);
  const before = (await pool.query("select * from registration_participants where id=$1", [participantId])).rows[0];
  const body = { action: "replace_participant", participantId, updatedAt: before.updated_at.toISOString(), name: "New student", email: `${randomUUID()}@example.test`, phone: "" };
  return { courseId, offeringId, registrationId, organisationId, participantId, retainedId, before, body };
}
it.skipIf(!enabled)("restricts coordinator changes to current roles, origin and strict versioned input", async () => {
  const f = await fixture();
  expect((await PATCH(request(f.body, ""))).status).toBe(401);
  expect((await PATCH(request(f.body, "student"))).status).toBe(403);
  expect((await PATCH(request(f.body, "unrelated"))).status).toBe(403);
  expect((await PATCH(request(f.body, "admin"))).status).toBe(403);
  expect((await PATCH(request(f.body, "coordinator", "https://untrusted.example"))).status).toBe(403);
  expect((await PATCH(request({ ...f.body, status: "approved" }))).status).toBe(422);
  expect((await PATCH(request({ ...f.body, updatedAt: undefined }))).status).toBe(422);
  expect((await PATCH(request({ ...f.body, updatedAt: "2000-01-01T00:00:00.000Z" }))).status).toBe(409);
  expect((await pool.query("select name from registration_participants where id=$1", [f.participantId])).rows[0].name).toBe("Old student");
});
it.skipIf(!enabled)("replacement clears inherited records, revokes old access and keeps the rest of the group unchanged", async () => {
  const f = await fixture(); const retained = (await pool.query("select * from registration_participants where id=$1", [f.retainedId])).rows[0];
  const replaced = await PATCH(request(f.body)); expect(replaced.status).toBe(200);
  const saved = (await pool.query("select * from registration_participants where id=$1", [f.participantId])).rows[0];
  expect(saved).toMatchObject({ name: "New student", status: "pending_review", profile_id: null, attendance: "not_recorded", completed_at: null, cancellation_requested_at: null });
  expect((await pool.query("select revoked_at from account_invitations where participant_id=$1", [f.participantId])).rows[0].revoked_at).toBeInstanceOf(Date);
  expect((await pool.query("select revoked_at from course_certificates where participant_id=$1", [f.participantId])).rows[0].revoked_at).toBeInstanceOf(Date);
  expect((await pool.query("select * from registration_participants where id=$1", [f.retainedId])).rows[0]).toEqual(retained);
  expect((await PATCH(request(f.body))).status).toBe(409);
  const student = await GET(new Request("http://localhost:3001/api/portal?scope=profile", { headers: { "x-fixture-user": "student" } }));
  expect((await student.json()).data.registrations.some((row: { participant: { id: string } }) => row.participant.id === f.participantId)).toBe(false);
  const approval = await adminUpdate(new Request("http://localhost:3001/api/admin/courses", { method: "PATCH", headers: { origin: "http://localhost:3001", "x-fixture-user": "admin" }, body: JSON.stringify({ action: "registration_status", id: f.registrationId, status: "approved" }) }));
  expect(approval.status).toBe(200);
  expect((await pool.query("select status from registration_participants where id=$1", [f.participantId])).rows[0].status).toBe("approved");
  expect((await pool.query("select * from registration_participants where id=$1", [f.retainedId])).rows[0]).toEqual(retained);
  expect((await pool.query("select revoked_at from course_certificates where participant_id=$1", [f.retainedId])).rows[0].revoked_at).toBeNull();
  expect((await pool.query("select amount_due_cents,payment_status from course_registrations where id=$1", [f.registrationId])).rows[0]).toEqual({ amount_due_cents: 25000, payment_status: "paid" });
});
