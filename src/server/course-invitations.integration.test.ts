import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
let database: ReturnType<typeof drizzle>;
vi.mock("@/server/db", () => ({ getDb: () => database }));
vi.mock("@/server/course-mail", () => ({ sendCourseMail: vi.fn(async () => ({ delivered: true })) }));
vi.mock("@/server/site-mail", () => ({ sendPrimaryInboxMail: vi.fn(async () => ({ delivered: true })), getSiteMailConfig: vi.fn(() => ({ smtpUrl: "fixture-only" })) }));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ api: { getSession: async ({ headers }: { headers: Headers }) => {
  const id = headers.get("x-fixture-user"); return id ? { user: { id, email: `${id}@example.test` } } : null;
} } }) }));
import { POST } from "@/app/api/portal/invitations/accept/route";
import { GET as adminSnapshot, PATCH as adminUpdate } from "@/app/api/admin/courses/route";
import { POST as register } from "@/app/api/courses/route";
import { sendCourseMail } from "@/server/course-mail";
import { getSiteMailConfig } from "@/server/site-mail";
import { POST as accessEmail } from "@/app/api/admin/courses/access-email/route";
import { GET as portal } from "@/app/api/portal/route";
import { GET as learning } from "@/app/api/portal/learning/route";
const enabled = process.env.BOOKING_DB_TESTS === "1";
const fixtureSchema = `course_invite_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool; let setupPool: Pool;
const accept = (token: string, actor = "invite-student", origin = "http://localhost:3001", extra = {}) => POST(new Request("http://localhost:3001/api/portal/invitations/accept", { method: "POST", headers: { origin, "content-type": "application/json", ...(actor ? { "x-fixture-user": actor } : {}) }, body: JSON.stringify({ token, ...extra }) }));
beforeAll(async () => {
  if (!enabled) return; process.loadEnvFile(".env.local"); const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web" || !/^course_invite_test_[a-f0-9]{32}$/.test(fixtureSchema)) throw new Error("Verified local fixture database required.");
  setupPool = new Pool({ connectionString: url.href }); await setupPool.query(`create schema "${fixtureSchema}"`);
  for (const table of ["courses", "course_offerings", "course_registrations", "registration_participants", "organisations", "organisation_memberships", "account_invitations", "profiles", "audit_logs", "course_materials", "course_certificates", "course_invoices", "student_posts", "user", "course_modules", "course_lessons"]) await setupPool.query(`create table "${fixtureSchema}"."${table}" (like public."${table}" including all)`);
  pool = new Pool({ connectionString: url.href, options: `-c search_path=${fixtureSchema},public` }); database = drizzle(pool);
  for (const [actor, role] of [["invite-student", "customer"], ["invite-coordinator", "customer"], ["invite-other", "customer"], ["invite-staff", "staff"], ["invite-admin", "client_admin"]]) {
    await pool.query('insert into "user"(id,name,email) values($1,\'Invitation fixture\',$2)', [actor, `${actor}@example.test`]);
    await pool.query("insert into profiles(auth_user_id,display_name,role) values($1,'Invitation fixture',$2)", [actor, role]);
  }
});
afterAll(async () => { if (pool) await pool.end(); if (setupPool) { await setupPool.query(`drop schema if exists "${fixtureSchema}" cascade`); await setupPool.end(); } });
async function fixture(coordinator = false) {
  const courseId = randomUUID(), offeringId = randomUUID(), registrationId = randomUUID(), participantId = randomUUID(), organisationId = randomUUID();
  await pool.query("insert into courses(id,slug,title,summary,description) values($1,$2,'Invitation course','Fixture','Fixture')", [courseId, courseId]);
  await pool.query("insert into course_offerings(id,course_id,code,starts_at,ends_at,delivery_mode) values($1,$2,$3,'2097-10-01','2097-10-02','virtual')", [offeringId, courseId, offeringId]);
  await pool.query("insert into organisations(id,name) values($1,'Invitation fixture organisation')", [organisationId]);
  await pool.query("insert into course_registrations(id,offering_id,organisation_id,applicant_name,applicant_email,status) values($1,$2,$3,'Coordinator','invite-coordinator@example.test','approved')", [registrationId, offeringId, organisationId]);
  await pool.query("insert into registration_participants(id,registration_id,offering_id,name,email,email_normalized,status) values($1,$2,$3,'Student','invite-student@example.test','invite-student@example.test','approved')", [participantId, registrationId, offeringId]);
  const token = randomBytes(32).toString("base64url"); const actor = coordinator ? "invite-coordinator" : "invite-student";
  const invitationId = (await pool.query("insert into account_invitations(registration_id,participant_id,organisation_role,email,token_hash,expires_at) values($1,$2,$3,$4,$5,now()+interval '1 day') returning id", [registrationId, coordinator ? null : participantId, coordinator ? "coordinator" : "participant", `${actor}@example.test`, createHash("sha256").update(token).digest("hex")])).rows[0].id;
  return { courseId, offeringId, registrationId, participantId, organisationId, invitationId, token };
}
it.skipIf(!enabled)("requires an authenticated same-origin customer and strict invitation input", async () => {
  const { token } = await fixture(); expect((await accept(token, "")).status).toBe(401);
  expect((await accept(token, "invite-student", "https://untrusted.example")).status).toBe(403);
  expect((await accept(token, "invite-student", undefined, { organisationRole: "coordinator" })).status).toBe(422);
  expect((await accept(token, "invite-other")).status).toBe(409);
  await pool.query("update profiles set active=false where auth_user_id='invite-student'");
  try { expect((await accept(token)).status).toBe(409); } finally { await pool.query("update profiles set active=true where auth_user_id='invite-student'"); }
});
it.skipIf(!enabled)("accepts a valid invitation once under concurrency and links only its student", async () => {
  const f = await fixture(); const results = await Promise.all([accept(f.token), accept(f.token)]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect((await pool.query("select p.auth_user_id from registration_participants r join profiles p on p.id=r.profile_id where r.id=$1", [f.participantId])).rows[0].auth_user_id).toBe("invite-student");
  expect((await pool.query("select id from audit_logs where entity_id=$1", [f.invitationId])).rows).toHaveLength(1);
});
it.skipIf(!enabled)("rejects stale invitations after participant, registration or offering changes", async () => {
  for (const change of ["email", "status", "registration", "offering", "expired", "revoked", "owner"]) {
    const f = await fixture();
    if (change === "email") await pool.query("update registration_participants set email='replacement@example.test',email_normalized='replacement@example.test' where id=$1", [f.participantId]);
    if (change === "status") await pool.query("update registration_participants set status='pending_review' where id=$1", [f.participantId]);
    if (change === "registration") await pool.query("update course_registrations set status='cancelled' where id=$1", [f.registrationId]);
    if (change === "offering") await pool.query("update course_offerings set is_cancelled=true where id=$1", [f.offeringId]);
    if (change === "expired") await pool.query("update account_invitations set expires_at=now()-interval '1 second' where id=$1", [f.invitationId]);
    if (change === "revoked") await pool.query("update account_invitations set revoked_at=now() where id=$1", [f.invitationId]);
    if (change === "owner") await pool.query("update registration_participants set profile_id=(select id from profiles where auth_user_id='invite-other') where id=$1", [f.participantId]);
    expect((await accept(f.token)).status, change).toBe(409);
    expect((await pool.query("select accepted_at from account_invitations where id=$1", [f.invitationId])).rows[0].accepted_at).toBeNull();
  }
});
it.skipIf(!enabled)("grants coordinator access only to the current approved applicant and preserves existing stronger membership", async () => {
  const f = await fixture(true);
  await pool.query("insert into organisation_memberships(organisation_id,profile_id,role) select $1,id,'participant' from profiles where auth_user_id='invite-coordinator'", [f.organisationId]);
  expect((await accept(f.token, "invite-coordinator")).status).toBe(200);
  expect((await pool.query("select m.role from organisation_memberships m join profiles p on p.id=m.profile_id where m.organisation_id=$1 and p.auth_user_id='invite-coordinator'", [f.organisationId])).rows[0].role).toBe("coordinator");
  const stale = await fixture(true);
  await pool.query("update course_registrations set applicant_email='replacement@example.test' where id=$1", [stale.registrationId]);
  expect((await accept(stale.token, "invite-coordinator")).status).toBe(409);
  expect((await pool.query("select id from organisation_memberships where organisation_id=$1", [stale.organisationId])).rows).toHaveLength(0);
  const participant = await fixture();
  await pool.query("insert into organisation_memberships(organisation_id,profile_id,role) select $1,id,'coordinator' from profiles where auth_user_id='invite-student'", [participant.organisationId]);
  expect((await accept(participant.token)).status).toBe(200);
  expect((await pool.query("select role from organisation_memberships where organisation_id=$1", [participant.organisationId])).rows[0].role).toBe("coordinator");
});
it.skipIf(!enabled)("rejects malformed JSON, non-customer profiles and mismatched invitation participants", async () => {
  expect((await POST(new Request("http://localhost:3001/api/portal/invitations/accept", { method: "POST", headers: { origin: "http://localhost:3001", "x-fixture-user": "invite-student" }, body: "{" }))).status).toBe(422);
  const staff = await fixture();
  await pool.query("update account_invitations set email='invite-staff@example.test' where id=$1", [staff.invitationId]);
  await pool.query("update registration_participants set email='invite-staff@example.test',email_normalized='invite-staff@example.test' where id=$1", [staff.participantId]);
  expect((await accept(staff.token, "invite-staff")).status).toBe(409);
  const first = await fixture(), second = await fixture();
  await pool.query("update account_invitations set participant_id=$1 where id=$2", [second.participantId, first.invitationId]);
  expect((await accept(first.token)).status).toBe(409);
});
it.skipIf(!enabled)("rolls back account linking, membership and token consumption if auditing fails", async () => {
  const f = await fixture();
  await pool.query('update "user" set email_verified=false where id=\'invite-student\'');
  await pool.query(`create function "${fixtureSchema}".reject_accept_audit() returns trigger language plpgsql as $$ begin if NEW.action = 'course.invitation_accepted' then raise exception 'fixture audit failure'; end if; return NEW; end $$`);
  await pool.query(`create trigger accept_audit_failure before insert on audit_logs for each row execute function "${fixtureSchema}".reject_accept_audit()`);
  try { expect((await accept(f.token)).status).toBe(500); } finally { await pool.query("drop trigger accept_audit_failure on audit_logs"); }
  expect((await pool.query("select profile_id from registration_participants where id=$1", [f.participantId])).rows[0].profile_id).toBeNull();
  expect((await pool.query("select accepted_at from account_invitations where id=$1", [f.invitationId])).rows[0].accepted_at).toBeNull();
  expect((await pool.query("select id from organisation_memberships where organisation_id=$1", [f.organisationId])).rows).toHaveLength(0);
  expect((await pool.query('select email_verified from "user" where id=\'invite-student\'')).rows[0].email_verified).toBe(false);
  expect((await accept(f.token)).status).toBe(200);
});
it.skipIf(!enabled)("activates from the real form into the protected profile using actual invitation and portal handlers", async () => {
  const { chromium } = await import("@playwright/test"); const browser = await chromium.launch();
  try {
    for (const width of [375, 1440]) {
      const f = await fixture(); const page = await browser.newPage({ viewport: { width, height: 1000 } }); page.setDefaultTimeout(10000);
      const courseTitle = `Invitation course ${width}`;
      await pool.query("update courses set title=$1 where id=$2", [courseTitle, f.courseId]);
      const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
      try {
        await page.route("**/api/auth/**", async (route) => {
          if (route.request().url().includes("sign-up")) await route.fulfill({ status: 422, json: { code: "USER_ALREADY_EXISTS", message: "Account exists" } });
          else await route.fulfill({ json: { token: "fixture-token", user: { id: "invite-student", email: "invite-student@example.test", name: "Invitation fixture" } } });
        });
        await page.route("**/api/portal**", async (route) => {
          const headers = new Headers(route.request().headers()); headers.set("x-fixture-user", "invite-student");
          const incoming = new Request(route.request().url(), { method: route.request().method(), headers, ...(route.request().method() === "POST" ? { body: route.request().postData()! } : {}) });
          const path = new URL(incoming.url).pathname;
          if (!["/api/portal/invitations/accept", "/api/portal", "/api/portal/learning"].includes(path)) throw new Error("Unexpected portal request in isolated fixture.");
          const response = path.endsWith("/accept") ? await POST(incoming) : path.endsWith("/learning") ? await learning(incoming) : await portal(incoming);
          await route.fulfill({ status: response.status, body: await response.text(), contentType: "application/json" });
        });
        await page.goto(`http://localhost:3001/portal/activate?token=${f.token}`);
        await page.getByLabel("Full name", { exact: true }).fill("Invitation fixture");
        await page.getByLabel("Invited email address").fill("invite-student@example.test");
        await page.getByLabel("Create or enter password").fill("FictionalFixtureOnly42!");
        await page.getByRole("button", { name: "Activate portal", exact: true }).click();
        await expect.poll(() => new URL(page.url()).pathname, { timeout: 10000 }).toBe("/portal/profile");
        await expect.poll(() => page.getByText(courseTitle, { exact: true }).count(), { timeout: 10000 }).toBeGreaterThan(0);
        await page.reload(); await expect.poll(() => page.getByText(courseTitle, { exact: true }).count(), { timeout: 10000 }).toBeGreaterThan(0);
        await expect.poll(() => page.locator(".student-learning").getByRole("heading", { name: courseTitle, exact: true }).count(), { timeout: 10000 }).toBe(1);
        expect(await page.locator(".student-learning").getByRole("alert").count()).toBe(0);
        expect((await pool.query("select accepted_at from account_invitations where id=$1", [f.invitationId])).rows[0].accepted_at).toBeInstanceOf(Date);
        expect((await accept(f.token)).status).toBe(409); expect(errors).toEqual([]);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
}, 60000);

const statusUpdate = (id: string, status = "approved") => adminUpdate(new Request("http://localhost:3001/api/admin/courses", { method: "PATCH", headers: { origin: "http://localhost:3001", "x-fixture-user": "invite-admin" }, body: JSON.stringify({ action: "registration_status", id, status }) }));
const resend = (body: object, actor = "invite-admin", origin = "http://localhost:3001") => accessEmail(new Request("http://localhost:3001/api/admin/courses/access-email", { method: "POST", headers: { origin, "x-fixture-user": actor }, body: JSON.stringify(body) }));
it.skipIf(!enabled)("shows approval warnings and retries access from the real admin form at three widths", async () => {
  const { chromium, expect: browserExpect } = await import("@playwright/test"); const browser = await chromium.launch();
  try { for (const width of [375, 1024, 1440]) {
    const f = await fixture(), name = `Access student ${width}`;
    await pool.query("update registration_participants set name=$1,status='pending_review' where id=$2", [name, f.participantId]);
    const page = await browser.newPage({ viewport: { width, height: 1000 } }); page.setDefaultTimeout(10000);
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.route("**/api/admin/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (!["/api/admin/courses", "/api/admin/courses/access-email"].includes(path)) return route.fulfill({ json: { ok: true, data: {} } });
        const incoming = new Request(route.request().url(), { method: route.request().method(), headers: { origin: "http://localhost:3001", "x-fixture-user": "invite-admin" }, ...(route.request().method() !== "GET" ? { body: route.request().postData()! } : {}) });
        const response = path.endsWith("/access-email") ? await accessEmail(incoming) : incoming.method === "GET" ? await adminSnapshot(incoming) : await adminUpdate(incoming);
        await route.fulfill({ status: response.status, body: await response.text(), contentType: "application/json" });
      });
      await page.goto("http://localhost:3001/admin/courses");
      vi.mocked(sendCourseMail).mockResolvedValueOnce({ delivered: false });
      await page.getByLabel(`Registration status for ${name}`, { exact: true }).selectOption("approved");
      await browserExpect(page.locator(".cms-admin__notice")).toContainText("Do not repeat the approval");
      const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Course access email", exact: true }) });
      const button = form.getByRole("button", { name: "Send access email", exact: true });
      await browserExpect(button).toBeDisabled();
      await form.getByLabel("Access email recipient").selectOption(f.participantId);
      vi.mocked(sendCourseMail).mockResolvedValueOnce({ delivered: false });
      await button.click(); await browserExpect(form.getByRole("alert")).toContainText("not delivered");
      await browserExpect(form.getByLabel("Access email recipient")).toHaveValue(f.participantId);
      await button.click(); await browserExpect(form.getByRole("alert")).toContainText("Wait one minute");
      await pool.query("update audit_logs set created_at=now()-interval '61 seconds' where entity_id=$1", [`${f.registrationId}:${f.participantId}`]);
      await button.click(); await browserExpect(form.getByRole("status")).toContainText("Access email sent");
      await form.getByLabel("Access email recipient").selectOption(`${f.registrationId}:coordinator`);
      await browserExpect(form.getByText("The access email will be sent to invite-coordinator@example.test.")).toBeVisible();
      await button.click(); await browserExpect(form.getByRole("status")).toContainText("Access email sent");
      expect(await form.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await form.evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Manrope");
      await form.screenshot({ path: `test-results/course-access-email-${width}.png` });
      await page.reload(); await browserExpect(page.getByLabel(`Registration status for ${name}`, { exact: true })).toHaveValue("approved");
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  } } finally { await browser.close(); }
}, 60000);
it.skipIf(!enabled)("resends current approved access once, revokes old links and preserves the registration", async () => {
  const f = await fixture();
  await pool.query('update "user" set email_verified=false where id=\'invite-student\'');
  const body = { registrationId: f.registrationId, participantId: f.participantId, recipient: "participant" };
  vi.mocked(sendCourseMail).mockClear();
  expect((await resend(body, "")).status).toBe(401);
  expect((await resend(body, "invite-student")).status).toBe(403);
  expect((await resend(body, undefined, "https://untrusted.example")).status).toBe(403);
  expect((await resend({ ...body, email: "other@example.test" })).status).toBe(422);
  vi.mocked(getSiteMailConfig).mockReturnValueOnce({ smtpUrl: "", from: "", recipient: "" });
  expect((await resend(body)).status).toBe(503);
  expect((await Promise.all([resend(body), resend(body)])).map((r) => r.status).sort()).toEqual([200, 429]);
  expect(vi.mocked(sendCourseMail)).toHaveBeenCalledTimes(1);
  const message = vi.mocked(sendCourseMail).mock.calls[0][0]; expect(message.to).toBe("invite-student@example.test");
  const link = message.text.split("\n").find((line) => line.includes("/portal/activate?token="))!;
  const token = new URL(link).searchParams.get("token")!;
  expect((await accept(f.token)).status).toBe(409);
  expect((await accept(token)).status).toBe(200);
  const audits = (await pool.query("select metadata from audit_logs where entity_id=$1", [`${f.registrationId}:${f.participantId}`])).rows;
  expect(audits).toHaveLength(1); expect(JSON.stringify(audits)).not.toContain(token);
  await pool.query("update audit_logs set created_at=now()-interval '61 seconds' where entity_id=$1", [`${f.registrationId}:${f.participantId}`]);
  expect((await resend(body)).status).toBe(200);
  expect(vi.mocked(sendCourseMail).mock.calls.at(-1)![0].text).toContain("/portal/login");
  expect((await pool.query("select status from course_registrations where id=$1", [f.registrationId])).rows[0].status).toBe("approved");
});
it.skipIf(!enabled)("rejects stale or unsuitable resend targets and supports non-participant coordinators", async () => {
  for (const invalid of ["registration", "participant", "offering", "staff", "owner", "wrong_group"]) {
    const f = await fixture(), body = { registrationId: f.registrationId, participantId: f.participantId, recipient: "participant" };
    if (invalid === "registration") await pool.query("update course_registrations set status='rejected' where id=$1", [f.registrationId]);
    if (invalid === "participant") await pool.query("update registration_participants set status='pending_review' where id=$1", [f.participantId]);
    if (invalid === "offering") await pool.query("update course_offerings set is_cancelled=true where id=$1", [f.offeringId]);
    if (invalid === "staff") await pool.query("update registration_participants set email_normalized='invite-staff@example.test' where id=$1", [f.participantId]);
    if (invalid === "owner") await pool.query("update registration_participants set profile_id=(select id from profiles where auth_user_id='invite-other') where id=$1", [f.participantId]);
    if (invalid === "wrong_group") body.participantId = (await fixture()).participantId;
    expect((await resend(body)).status, invalid).toBe(409);
  }
  const f = await fixture(true); vi.mocked(sendCourseMail).mockClear();
  expect((await resend({ registrationId: f.registrationId, recipient: "coordinator" })).status).toBe(200);
  const message = vi.mocked(sendCourseMail).mock.calls[0][0]; expect(message.to).toBe("invite-coordinator@example.test");
  const link = message.text.split("\n").find((line) => line.includes("/portal/activate?token="))!;
  expect((await accept(new URL(link).searchParams.get("token")!, "invite-coordinator")).status).toBe(200);
});
it.skipIf(!enabled)("allows retry after failed access delivery and rolls back token rotation on audit failure", async () => {
  const f = await fixture(), body = { registrationId: f.registrationId, participantId: f.participantId, recipient: "participant" };
  vi.mocked(sendCourseMail).mockRejectedValueOnce(new Error("Fixture failure"));
  expect((await resend(body)).status).toBe(503);
  expect((await resend(body)).status).toBe(429);
  await pool.query("update audit_logs set created_at=now()-interval '61 seconds' where entity_id=$1", [`${f.registrationId}:${f.participantId}`]);
  expect((await resend(body)).status).toBe(200);
  const other = await fixture();
  await pool.query(`create function "${fixtureSchema}".reject_resend_audit() returns trigger language plpgsql as $$ begin if NEW.action='course.access_email_requested' then raise exception 'fixture audit failure'; end if; return NEW; end $$`);
  await pool.query(`create trigger reject_resend_audit before insert on "${fixtureSchema}".audit_logs for each row execute function "${fixtureSchema}".reject_resend_audit()`);
  try {
    expect((await resend({ registrationId: other.registrationId, participantId: other.participantId, recipient: "participant" })).status).toBe(500);
    expect((await pool.query("select revoked_at from account_invitations where id=$1", [other.invitationId])).rows[0].revoked_at).toBeNull();
    expect((await pool.query("select id from account_invitations where registration_id=$1", [other.registrationId])).rows).toHaveLength(1);
  } finally { await pool.query(`drop trigger reject_resend_audit on "${fixtureSchema}".audit_logs`); }
});
it.skipIf(!enabled)("preserves approval and continues other deliveries when an access email fails", async () => {
  for (const failure of ["undelivered", "throw"]) {
    const f = await fixture();
    await pool.query("update course_registrations set status='pending_review' where id=$1", [f.registrationId]);
    const mail = vi.mocked(sendCourseMail); mail.mockClear();
    if (failure === "throw") mail.mockRejectedValueOnce(new Error("Fixture transport failure"));
    else mail.mockResolvedValueOnce({ delivered: false });
    const response = await statusUpdate(f.registrationId);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, data: { status: "approved" }, notifications: { attempted: 2, failed: 1 } });
    expect(body.message).toContain("Registration decision saved, but 1 of 2 notification emails were not delivered");
    expect(body.message).toContain("Do not repeat the approval");
    expect(mail).toHaveBeenCalledTimes(2);
    expect((await pool.query("select status from course_registrations where id=$1", [f.registrationId])).rows[0].status).toBe("approved");
    expect((await pool.query("select id from audit_logs where entity_id=$1 and action='course.registration_status_updated'", [f.registrationId])).rows).toHaveLength(1);
    const repeated = await statusUpdate(f.registrationId);
    expect((await repeated.json()).notifications).toEqual({ attempted: 0, failed: 0 });
    expect(mail).toHaveBeenCalledTimes(2);
  }
});
it.skipIf(!enabled)("reports failed decision notifications without misreporting the persisted rejection", async () => {
  const f = await fixture(); vi.mocked(sendCourseMail).mockResolvedValueOnce({ delivered: false });
  const response = await statusUpdate(f.registrationId, "rejected");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, data: { status: "rejected" }, notifications: { attempted: 1, failed: 1 } });
  expect((await pool.query("select id from account_invitations where registration_id=$1 and revoked_at is null", [f.registrationId])).rows).toHaveLength(0);
});
it.skipIf(!enabled)("refuses approval when an existing participant or coordinator account is not an active student", async () => {
  for (const target of ["participant", "coordinator"]) for (const state of ["staff", "inactive", "missing_profile"]) {
    const f = await fixture(); const actor = `blocked-${randomUUID()}`; const email = `${actor}@example.test`;
    await pool.query('insert into "user"(id,name,email) values($1,\'Blocked fixture\',$2)', [actor, email]);
    if (state !== "missing_profile") await pool.query("insert into profiles(auth_user_id,display_name,role,active) values($1,'Blocked fixture',$2,$3)", [actor, state === "staff" ? "staff" : "customer", state !== "inactive"]);
    await pool.query("update course_registrations set status='pending_review' where id=$1", [f.registrationId]);
    await pool.query("update registration_participants set status='pending_review' where id=$1", [f.participantId]);
    if (target === "participant") await pool.query("update registration_participants set email=$1,email_normalized=$1 where id=$2", [email, f.participantId]);
    else await pool.query("update course_registrations set applicant_email=$1 where id=$2", [email, f.registrationId]);
    expect((await statusUpdate(f.registrationId)).status, `${target}: ${state}`).toBe(409);
    expect((await pool.query("select status from course_registrations where id=$1", [f.registrationId])).rows[0].status).toBe("pending_review");
    const participant = (await pool.query("select status,profile_id from registration_participants where id=$1", [f.participantId])).rows[0];
    expect(participant).toEqual({ status: "pending_review", profile_id: null });
    expect((await pool.query("select id from audit_logs where entity_id=$1", [f.registrationId])).rows).toHaveLength(0);
  }
});
it.skipIf(!enabled)("approval upgrades an existing student coordinator and invalidates invitations on rejection and reapproval", async () => {
  await pool.query('update "user" set email_verified=true where id=\'invite-coordinator\'');
  await pool.query('update "user" set email_verified=false where id=\'invite-student\'');
  const f = await fixture();
  await pool.query("update course_registrations set status='pending_review' where id=$1", [f.registrationId]);
  await pool.query("insert into organisation_memberships(organisation_id,profile_id,role) select $1,id,'participant' from profiles where auth_user_id='invite-coordinator'", [f.organisationId]);
  expect((await statusUpdate(f.registrationId)).status).toBe(200);
  expect((await pool.query("select role from organisation_memberships where organisation_id=$1", [f.organisationId])).rows[0].role).toBe("coordinator");
  expect((await accept(f.token)).status).toBe(409);
  const current = (await pool.query("select id from account_invitations where registration_id=$1 and revoked_at is null and accepted_at is null", [f.registrationId])).rows;
  expect(current).toHaveLength(1);
  expect((await statusUpdate(f.registrationId, "rejected")).status).toBe(200);
  expect((await pool.query("select id from account_invitations where registration_id=$1 and revoked_at is null and accepted_at is null", [f.registrationId])).rows).toHaveLength(0);
});
it.skipIf(!enabled)("requires email ownership proof before an existing unverified account receives registration access", async () => {
  const f = await fixture(); const actor = `unverified-${randomUUID()}`, email = `${actor}@example.test`;
  await pool.query('insert into "user"(id,name,email) values($1,\'Unverified fixture\',$2)', [actor, email]);
  await pool.query("insert into profiles(auth_user_id,display_name,role) values($1,'Unverified fixture','customer')", [actor]);
  await pool.query("update courses set is_active=true,status='published' where id=$1", [f.courseId]);
  await pool.query("update course_offerings set is_published=true where id=$1", [f.offeringId]);
  const submitted = await register(new Request("http://localhost:3001/api/courses", { method: "POST", body: JSON.stringify({ offeringId: f.offeringId, applicantName: "Unverified fixture", applicantEmail: email, consent: true, participants: [{ name: "Unverified fixture", email }] }) }));
  expect(submitted.status).toBe(201);
  const participant = (await pool.query("select id,registration_id,profile_id from registration_participants where offering_id=$1 and email_normalized=$2", [f.offeringId, email])).rows[0];
  expect(participant.profile_id).toBeNull();
  vi.mocked(sendCourseMail).mockClear();
  expect((await statusUpdate(participant.registration_id)).status).toBe(200);
  expect((await pool.query("select profile_id from registration_participants where id=$1", [participant.id])).rows[0].profile_id).toBeNull();
  const message = vi.mocked(sendCourseMail).mock.calls.find(([input]) => input.to === email)?.[0].text;
  const link = message?.split("\n").find((line) => line.includes("/portal/activate?token="));
  expect(link).toBeTruthy();
  const token = new URL(link!).searchParams.get("token")!;
  expect((await accept(token, actor)).status).toBe(200);
  expect((await pool.query('select email_verified from "user" where id=$1', [actor])).rows[0].email_verified).toBe(true);
  const ownPortal = await portal(new Request("http://localhost:3001/api/portal?scope=profile", { headers: { "x-fixture-user": actor } }));
  expect((await ownPortal.json()).data.registrations.map((row: { participant: { id: string } }) => row.participant.id)).toEqual([participant.id]);
  expect((await accept(token, actor)).status).toBe(409);
});
