import { expect, request as playwrightRequest, test } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

test.use({ trace: "off", screenshot: "off" });
test("admin uploads individual materials; only the assigned approved student can download", async ({ browser }) => {
  test.skip(process.env.BOOKING_DB_TESTS !== "1", "Explicit local fixture run required."); test.setTimeout(90000);
  const baseURL = process.env.COURSE_E2E_BASE_URL || "http://localhost:3001"; const url = new URL(process.env.DATABASE_URL!);
  const storage = path.resolve(process.env.COURSE_STORAGE_DIR || path.join(process.cwd(), "storage", "course-portal"));
  if (new URL(baseURL).origin !== "http://localhost:3001" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web" || storage !== path.join(process.cwd(), "storage", "course-portal")) throw new Error("Verified local database, server and storage required.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL }); const suffix = randomUUID(); const courseId = randomUUID();
  const identities: string[] = []; const contexts: Awaited<ReturnType<typeof playwrightRequest.newContext>>[] = []; const windows: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  try {
    for (const role of ["admin", "student", "other"]) {
      const context = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } }); contexts.push(context);
      const result = await context.post("/api/auth/sign-up/email", { data: { name: `Material ${role}`, email: `material-live-${role}-${suffix}@example.test`, password: randomBytes(24).toString("hex") } });
      expect(result.status()).toBe(200); identities.push((await result.json()).user.id);
    }
    const [admin, student, other] = contexts;
    await pool.query("update profiles set role='client_admin' where auth_user_id=$1", [identities[0]]);
    await pool.query("insert into courses(id,slug,title,summary,description) values($1,$2,'Material live fixture','Local verification','Temporary private course')", [courseId, `material-live-${suffix}`]);
    const offeringId = (await pool.query("insert into course_offerings(course_id,code,starts_at,ends_at,delivery_mode) values($1,$2,'2097-10-01','2097-10-02','virtual') returning id", [courseId, `material-${suffix}`])).rows[0].id;
    const registrationId = (await pool.query("insert into course_registrations(offering_id,applicant_name,applicant_email) values($1,'Material student',$2) returning id", [offeringId, `material-live-student-${suffix}@example.test`])).rows[0].id;
    for (const index of [1, 2]) { const email = `material-live-${index === 1 ? "student" : "other"}-${suffix}@example.test`; await pool.query("insert into registration_participants(registration_id,offering_id,profile_id,name,email,email_normalized,status) select $1,$2,id,display_name,$3,$3,'approved' from profiles where auth_user_id=$4", [registrationId, offeringId, email, identities[index]]); }
    const studentId = (await pool.query("select id from profiles where auth_user_id=$1", [identities[1]])).rows[0].id;
    const window = await browser.newContext({ baseURL, storageState: await admin.storageState() }); windows.push(window); const page = await window.newPage();
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message)); await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Materials", exact: true }).click();
    const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Upload and assign material" }) });
    await form.getByLabel("Material title", { exact: true }).fill("Personal workbook"); await form.getByLabel("Assign to course").selectOption(courseId);
    await form.getByLabel("Student assignment").selectOption(studentId);
    await form.getByLabel("File", { exact: true }).setInputFiles({ name: "workbook.txt", mimeType: "text/plain", buffer: Buffer.from("Private student workbook") });
    await form.getByRole("button", { name: "Upload secure material" }).click(); await expect(form.getByRole("status")).toContainText("version 1");
    await expect(form.getByLabel("Material title", { exact: true })).toHaveValue("");
    const [material] = (await pool.query("select id,recipient_profile_id,version from course_materials where course_id=$1", [courseId])).rows;
    expect(material.recipient_profile_id).toBe(studentId);
    await page.reload(); await page.getByRole("button", { name: "Materials", exact: true }).click();
    const row = page.getByRole("row").filter({ hasText: "Personal workbook" }); await expect(row).toContainText("Material student");
    const studentWindow = await browser.newContext({ baseURL, storageState: await student.storageState() }); windows.push(studentWindow); const profile = await studentWindow.newPage(); await profile.goto("/portal/profile");
    const link = profile.getByRole("link", { name: /Personal workbook/ }); await expect(link).toBeVisible();
    const downloadUrl = await link.getAttribute("href"); expect(downloadUrl).toBe(`/api/portal/downloads/material/${material.id}`);
    const file = await student.get(downloadUrl!); expect(file.status()).toBe(200); expect(await file.text()).toBe("Private student workbook"); expect(file.headers()["cache-control"]).toBe("private, no-store");
    expect((await other.get(downloadUrl!)).status()).toBe(403);
    expect((await (await other.get("/api/portal?scope=profile")).json()).data.materials).toEqual([]);
    await row.getByRole("button", { name: "Archive", exact: true }).click(); await expect(row.getByRole("button", { name: "Restore" })).toBeVisible();
    await profile.reload(); await expect(profile.getByRole("link", { name: /Personal workbook/ })).toHaveCount(0); expect((await student.get(downloadUrl!)).status()).toBe(404);
    await row.getByRole("button", { name: "Restore" }).click(); await expect(row.getByRole("button", { name: "Archive", exact: true })).toBeVisible();
    await profile.reload(); await expect(link).toBeVisible();
    await pool.query("update registration_participants set status='pending_review' where profile_id=$1", [studentId]);
    expect((await student.get(downloadUrl!)).status()).toBe(403); await profile.reload(); await expect(link).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    for (const window of windows) await window.close(); for (const context of contexts) await context.dispose();
    for (const { storage_key: key } of (await pool.query("select storage_key from course_materials where course_id=$1", [courseId])).rows) {
      const target = path.resolve(storage, key); if (!/^materials\/[a-f0-9-]{36}\.txt$/.test(key) || !target.startsWith(storage + path.sep)) throw new Error("Unsafe fixture cleanup.");
      await unlink(target).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    }
    await pool.query("delete from courses where id=$1", [courseId]);
    for (const id of identities) { await pool.query("delete from audit_logs where actor_auth_user_id=$1", [id]); await pool.query("delete from profiles where auth_user_id=$1", [id]); await pool.query('delete from "user" where id=$1', [id]); }
    await pool.end();
  }
});
