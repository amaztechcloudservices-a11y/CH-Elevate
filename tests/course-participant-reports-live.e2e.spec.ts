import { expect, request as playwrightRequest, test } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import { Pool } from "pg";
test.use({ trace: "off", screenshot: "off" });
test("real admin selects individual participants, downloads saved records and rejects invalid exports", async ({ browser }) => {
  test.skip(process.env.BOOKING_DB_TESTS !== "1", "Explicit local fixture run required."); test.setTimeout(90000);
  const baseURL = process.env.COURSE_E2E_BASE_URL || "http://localhost:3001"; const url = new URL(process.env.DATABASE_URL!);
  if (new URL(baseURL).origin !== "http://localhost:3001" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web") throw new Error("Verified local database and server required.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL }); const suffix = randomUUID(); const courseIds = [randomUUID(), randomUUID()]; const ids: string[] = [];
  const contexts: Awaited<ReturnType<typeof playwrightRequest.newContext>>[] = []; const windows: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  const endpoint = "/api/admin/courses/participants/report";
  try {
    for (const role of ["admin", "student"]) {
      const context = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } }); contexts.push(context);
      const response = await context.post("/api/auth/sign-up/email", { data: { name: `Report ${role}`, email: `report-live-${role}-${suffix}@example.test`, password: randomBytes(24).toString("hex") } });
      expect(response.status()).toBe(200); ids.push((await response.json()).user.id);
    }
    const [admin, student] = contexts; await pool.query("update profiles set role='client_admin' where auth_user_id=$1", [ids[0]]);
    const participantIds: string[] = [];
    for (const [index, courseId] of courseIds.entries()) {
      await pool.query("insert into courses(id,slug,title,summary,description) values($1,$2,$3,'Local verification','Temporary report course')", [courseId, `report-live-${index}-${suffix}`, index === 0 ? "Participant report fixture" : "Excluded course fixture"]);
      const offeringId = (await pool.query("insert into course_offerings(course_id,code,starts_at,ends_at,delivery_mode) values($1,$2,'2097-10-01','2097-10-02','virtual') returning id", [courseId, `REPORT-${index}-${suffix}`])).rows[0].id;
      const registrationId = (await pool.query("insert into course_registrations(offering_id,applicant_name,applicant_email,admin_notes) values($1,'Private applicant','private-applicant@example.test','Never include private admin notes') returning id", [offeringId])).rows[0].id;
      for (const name of index === 0 ? ["José Selected", "Zoë Selected", "Unselected Participant"] : ["Other Course Participant"]) {
        const email = `${name.split(" ")[0].toLowerCase()}@example.test`; const participantId = randomUUID(); participantIds.push(participantId);
        await pool.query("insert into registration_participants(id,registration_id,offering_id,name,email,email_normalized,status) values($1,$2,$3,$4,$5,$5,'approved')", [participantId, registrationId, offeringId, name, email]);
      }
    }
    const data = { courseId: courseIds[0], participantIds: participantIds.slice(0, 2) };
    const anonymous = await playwrightRequest.newContext({ baseURL }); contexts.push(anonymous);
    expect((await anonymous.post(endpoint, { data })).status()).toBe(401); expect((await student.post(endpoint, { data })).status()).toBe(403);
    expect((await admin.post(endpoint, { data, headers: { origin: "https://untrusted.example" } })).status()).toBe(403);
    for (const invalid of [{ ...data, participantIds: [] }, { ...data, participantIds: [participantIds[0], participantIds[0]] }, { ...data, names: ["Invented participant"] }, { ...data, participantIds: Array(1001).fill(participantIds[0]) }]) expect((await admin.post(endpoint, { data: invalid })).status()).toBe(422);
    expect((await admin.post(endpoint, { data: { ...data, participantIds: [participantIds[0], participantIds[3]] } })).status()).toBe(409);
    expect((await admin.post(endpoint, { data: { ...data, participantIds: [randomUUID()] } })).status()).toBe(409);
    expect((await admin.post(endpoint, { data: "{" })).status()).toBe(415);
    expect((await admin.post(endpoint, { data: "{", headers: { "Content-Type": "application/json" } })).status()).toBe(422);
    expect((await admin.post(endpoint, { data: " ".repeat(50_001), headers: { "Content-Type": "application/json" } })).status()).toBe(413);
    const window = await browser.newContext({ baseURL, storageState: await admin.storageState() }); windows.push(window); const page = await window.newPage(); page.setDefaultTimeout(15000);
    await page.goto("/admin/courses"); await page.getByRole("button", { name: "Reports", exact: true }).click(); const panel = page.getByRole("region", { name: "Participant reports" });
    await panel.getByRole("combobox", { name: "Report course", exact: true }).selectOption(courseIds[0]); await expect(panel.getByRole("checkbox")).toHaveCount(3);
    await panel.getByRole("checkbox", { name: /Include José Selected/ }).check(); await expect(panel.getByRole("button", { name: "Download selected PDF (1)" })).toBeEnabled();
    await panel.getByRole("checkbox", { name: /Include Zoë Selected/ }).check();
    const downloadPromise = page.waitForEvent("download"); const responsePromise = page.waitForResponse((response) => response.url().endsWith(endpoint));
    await panel.getByRole("button", { name: "Download selected PDF (2)" }).click(); const download = await downloadPromise; const response = await responsePromise;
    expect(response.status()).toBe(200); expect(response.headers()["cache-control"]).toBe("private, no-store"); expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["content-disposition"]).toContain("attachment"); await download.saveAs("test-results/participant-report-live.pdf");
    const pdf = await PDFDocument.load(await readFile("test-results/participant-report-live.pdf")); expect(pdf.getSubject()).toBe("2 selected participant records"); expect(pdf.getPageCount()).toBe(1);
    const audits = (await pool.query("select metadata from audit_logs where actor_auth_user_id=$1 and action='course.participant_report_exported'", [ids[0]])).rows;
    expect(audits).toEqual([{ metadata: { participantCount: 2 } }]);
    await pool.query("delete from registration_participants where id=$1", [participantIds[0]]); expect((await admin.post(endpoint, { data })).status()).toBe(409);
    await pool.query("update profiles set active=false where auth_user_id=$1", [ids[0]]); expect((await admin.post(endpoint, { data })).status()).toBe(403);
  } finally {
    for (const window of windows) await window.close().catch(() => {}); for (const context of contexts) await context.dispose().catch(() => {});
    await pool.query("delete from courses where id=any($1::uuid[])", [courseIds]);
    for (const id of ids) { await pool.query("delete from audit_logs where actor_auth_user_id=$1", [id]); await pool.query("delete from profiles where auth_user_id=$1", [id]); await pool.query('delete from "user" where id=$1', [id]); }
    await pool.end();
  }
});
