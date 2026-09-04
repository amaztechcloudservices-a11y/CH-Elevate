import { expect, request as playwrightRequest, test } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
test.use({ trace: "off", screenshot: "off" });
test("real admin downloads aggregate course analytics; student and inactive admin are denied", async ({ browser }) => {
  test.skip(process.env.BOOKING_DB_TESTS !== "1", "Explicit local fixture run required."); test.setTimeout(90000);
  const baseURL = process.env.COURSE_E2E_BASE_URL || "http://localhost:3001"; const url = new URL(process.env.DATABASE_URL!);
  if (new URL(baseURL).origin !== "http://localhost:3001" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web") throw new Error("Verified local database and server required.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL }); const suffix = randomUUID(); const courseId = randomUUID(); const ids: string[] = [];
  const contexts: Awaited<ReturnType<typeof playwrightRequest.newContext>>[] = []; const windows: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  const filters = { courseId, from: "2097-01-01", to: "2097-03-31" }; const endpoint = `/api/admin/courses/analytics?${new URLSearchParams(filters)}`;
  try {
    for (const role of ["admin", "student"]) {
      const context = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } }); contexts.push(context);
      const response = await context.post("/api/auth/sign-up/email", { data: { name: `Analytics ${role}`, email: `analytics-live-${role}-${suffix}@example.test`, password: randomBytes(24).toString("hex") } });
      expect(response.status()).toBe(200); ids.push((await response.json()).user.id);
    }
    const [admin, student] = contexts; await pool.query("update profiles set role='client_admin' where auth_user_id=$1", [ids[0]]);
    await pool.query("insert into courses(id,slug,title,summary,description) values($1,$2,'Analytics fixture','Local verification','Temporary analytics course')", [courseId, `analytics-live-${suffix}`]);
    const offeringId = (await pool.query("insert into course_offerings(course_id,code,starts_at,ends_at,delivery_mode) values($1,$2,'2098-10-01','2098-10-02','virtual') returning id", [courseId, `ANALYTICS-${suffix}`])).rows[0].id;
    for (const [createdAt, payment, statuses] of [
      ["2097-01-01T04:59:59Z", "unpaid", ["pending_review"]],
      ["2097-01-01T05:00:00Z", "paid", ["approved", "completed"]],
      ["2097-02-15T10:00:00Z", "partially_paid", ["waitlisted"]],
      ["2097-04-01T05:00:00Z", "unpaid", ["pending_review"]],
    ] as const) {
      const registrationId = (await pool.query("insert into course_registrations(offering_id,applicant_name,applicant_email,admin_notes,created_at,payment_status) values($1,'Private analytics applicant','private-analytics@example.test','Private analytics notes',$2,$3) returning id", [offeringId, createdAt, payment])).rows[0].id;
      for (const [index, status] of statuses.entries()) await pool.query("insert into registration_participants(registration_id,offering_id,name,email,email_normalized,status) values($1,$2,'Private analytics participant',$3,$3,$4)", [registrationId, offeringId, `private-analytics-${registrationId}-${index}@example.test`, status]);
    }
    const anonymous = await playwrightRequest.newContext({ baseURL }); contexts.push(anonymous);
    for (const format of ["json", "csv"]) {
      expect((await anonymous.get(`${endpoint}&format=${format}`)).status()).toBe(401);
      expect((await student.get(`${endpoint}&format=${format}`)).status()).toBe(403);
    }
    const window = await browser.newContext({ baseURL, storageState: await admin.storageState() }); windows.push(window); const page = await window.newPage(); page.setDefaultTimeout(15000);
    await page.goto("/admin/courses"); await page.getByRole("button", { name: "Analytics", exact: true }).click();
    const panel = page.getByRole("region", { name: "Course analytics", exact: true });
    await panel.getByRole("combobox", { name: "Analytics course", exact: true }).selectOption(courseId);
    await panel.getByLabel("Submitted from (Jamaica)", { exact: true }).fill(filters.from); await panel.getByLabel("Submitted through (Jamaica)", { exact: true }).fill(filters.to);
    const responsePromise = page.waitForResponse((response) => response.url().endsWith(endpoint));
    await panel.getByRole("button", { name: "Apply analytics filters" }).click(); const response = await responsePromise;
    expect(response.status()).toBe(200); expect(response.headers()["cache-control"]).toBe("private, no-store");
    const report = (await response.json()).data; expect(report.totals).toMatchObject({ applications: 2, participants: 3, approved: 2, completed: 1, waitlisted: 1 });
    expect(report.monthly).toEqual([{ month: "2097-01", applications: 1, participants: 2 }, { month: "2097-02", applications: 1, participants: 1 }, { month: "2097-03", applications: 0, participants: 0 }]);
    expect(JSON.stringify(report)).not.toMatch(/Private analytics|private-analytics/);
    await expect(panel.locator(".analytics-metrics dd")).toHaveText(["2", "3", "2", "0", "1", "1"]);
    const downloadPromise = page.waitForEvent("download"); await panel.getByRole("link", { name: "Download summary CSV" }).click(); const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("course-analytics-2097-01-01-to-2097-03-31.csv"); await download.saveAs("test-results/course-analytics-live.csv");
    const csv = await readFile("test-results/course-analytics-live.csv", "utf8"); expect(csv).toContain('"Totals","","","","2","3",""');
    expect(csv).toContain('"Application payment status","","","paid","","","1"'); expect(csv).not.toMatch(/Private analytics|private-analytics/);
    await pool.query("update profiles set active=false where auth_user_id=$1", [ids[0]]);
    expect((await admin.get(endpoint)).status()).toBe(403); expect((await admin.get(`${endpoint}&format=csv`)).status()).toBe(403);
  } finally {
    for (const window of windows) await window.close().catch(() => {}); for (const context of contexts) await context.dispose().catch(() => {});
    await pool.query("delete from courses where id=$1", [courseId]);
    for (const id of ids) { await pool.query("delete from audit_logs where actor_auth_user_id=$1", [id]); await pool.query("delete from profiles where auth_user_id=$1", [id]); await pool.query('delete from "user" where id=$1', [id]); }
    await pool.end();
  }
});
