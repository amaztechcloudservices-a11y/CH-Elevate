import { expect, request as playwrightRequest, test } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

test.use({ trace: "off", screenshot: "off" });
test("admin curriculum survives reload and only enrolled students can read and download", async ({ browser }) => {
  test.skip(process.env.BOOKING_DB_TESTS !== "1", "Opt in to local fixtures.");
  const baseURL = process.env.COURSE_E2E_BASE_URL || "http://localhost:3001";
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  const storage = path.resolve(process.env.COURSE_STORAGE_DIR || path.join(process.cwd(), "storage", "course-portal"));
  if (new URL(baseURL).origin !== "http://localhost:3001" || !["localhost", "127.0.0.1"].includes(databaseUrl.hostname) || databaseUrl.port !== "55434" || databaseUrl.pathname !== "/premium_web" || storage !== path.join(process.cwd(), "storage", "course-portal")) throw new Error("Verified local database, server and storage required.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL }); const suffix = randomUUID(); const courseId = randomUUID();
  const identities: string[] = []; const files: string[] = [];
  const contexts: Awaited<ReturnType<typeof playwrightRequest.newContext>>[] = [];
  const windows: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  try {
    for (const role of ["admin", "student", "outsider"]) {
      const context = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } }); contexts.push(context);
      const result = await context.post("/api/auth/sign-up/email", { data: { name: `Curriculum ${role}`, email: `curriculum-${role}-${suffix}@example.test`, password: randomBytes(24).toString("hex") } });
      expect(result.status()).toBe(200); identities.push((await result.json()).user.id);
    }
    const [admin, student, outsider] = contexts;
    await pool.query("update profiles set role='client_admin' where auth_user_id=$1", [identities[0]]);
    await pool.query("insert into courses(id,slug,title,summary,description) values($1,$2,'Curriculum live fixture','Local verification','Temporary local course, not advertised')", [courseId, `curriculum-live-${suffix}`]);
    const offeringId = (await pool.query("insert into course_offerings(course_id,code,starts_at,ends_at,delivery_mode) values($1,$2,'2097-10-01','2097-10-02','virtual') returning id", [courseId, `curriculum-${suffix}`])).rows[0].id;
    const email = `curriculum-student-${suffix}@example.test`;
    const registrationId = (await pool.query("insert into course_registrations(offering_id,applicant_name,applicant_email) values($1,'Curriculum student',$2) returning id", [offeringId, email])).rows[0].id;
    await pool.query("insert into registration_participants(registration_id,offering_id,profile_id,name,email,email_normalized,status) select $1,$2,id,'Curriculum student',$3,$3,'approved' from profiles where auth_user_id=$4", [registrationId, offeringId, email, identities[1]]);
    const upload = await admin.post("/api/admin/courses/materials", { multipart: { title: "Live workbook", courseId, offeringId: "", file: { name: "workbook.txt", mimeType: "text/plain", buffer: Buffer.from("Private live workbook") } } });
    expect(upload.status()).toBe(201); const material = (await upload.json()).data;
    files.push((await pool.query("select storage_key from course_materials where id=$1", [material.id])).rows[0].storage_key);
    const adminWindow = await browser.newContext({ baseURL, storageState: await admin.storageState() }); windows.push(adminWindow);
    const page = await adminWindow.newPage(); await page.goto("/admin/courses");
    await page.getByRole("button", { name: "Modules & lessons", exact: true }).click();
    await page.getByLabel("Course curriculum").selectOption(courseId);
    await page.getByRole("button", { name: "Add module", exact: true }).click();
    await page.getByLabel("Module title", { exact: true }).fill("Published foundations"); await page.getByLabel("Publish module", { exact: true }).check();
    await page.getByRole("button", { name: "Add lesson", exact: true }).click();
    await page.getByLabel("Lesson title", { exact: true }).fill("Protected reading");
    await page.getByLabel("Lesson text", { exact: true }).fill("Only enrolled students see this text."); await page.getByLabel("Publish lesson", { exact: true }).check();
    await page.getByRole("button", { name: "Add lesson", exact: true }).click();
    const second = page.getByRole("group", { name: "Lesson 2", exact: true });
    await second.getByLabel("Lesson title", { exact: true }).fill("Private workbook"); await second.getByLabel("Lesson format").selectOption("material");
    await second.getByLabel("Downloadable material", { exact: true }).selectOption(material.id); await second.getByLabel("Publish lesson", { exact: true }).check();
    await page.getByRole("button", { name: "Add lesson", exact: true }).click();
    await page.getByRole("group", { name: "Lesson 3", exact: true }).getByLabel("Lesson title", { exact: true }).fill("Unpublished draft");
    await page.getByRole("button", { name: "Save curriculum", exact: true }).click(); await expect(page.getByRole("status")).toContainText("Curriculum saved");
    await page.reload(); await page.getByRole("button", { name: "Modules & lessons", exact: true }).click(); await page.getByLabel("Course curriculum").selectOption(courseId);
    await expect(page.getByLabel("Module title", { exact: true })).toHaveValue("Published foundations");
    expect((await pool.query("select title from course_modules where course_id=$1", [courseId])).rows[0].title).toBe("Published foundations");
    const studentWindow = await browser.newContext({ baseURL, storageState: await student.storageState() }); windows.push(studentWindow);
    const profile = await studentWindow.newPage(); await profile.goto("/portal/profile");
    await expect(profile.getByRole("heading", { name: "Curriculum student", exact: true })).toBeVisible();
    await profile.locator("summary").filter({ hasText: "Protected reading" }).click(); await expect(profile.getByText("Only enrolled students see this text.", { exact: true })).toBeVisible();
    await expect(profile.getByText("Unpublished draft", { exact: false })).toHaveCount(0);
    await profile.locator("summary").filter({ hasText: "Private workbook" }).click();
    const downloadUrl = await profile.getByRole("link", { name: "Download course material" }).getAttribute("href");
    expect(downloadUrl).toBe(`/api/portal/downloads/material/${material.id}`);
    const file = await student.get(downloadUrl!); expect(file.status()).toBe(200); expect(await file.text()).toBe("Private live workbook");
    expect((await outsider.get(downloadUrl!)).status()).toBe(403);
    expect((await (await outsider.get("/api/portal/learning")).json()).data).toEqual([]);
    expect((await student.get(`/api/admin/course-curriculum?courseId=${courseId}`)).status()).toBe(403);
    await pool.query("update registration_participants set status='pending_review' where registration_id=$1", [registrationId]);
    await profile.reload(); await expect(profile.getByText("No approved course enrolments yet.", { exact: false })).toBeVisible();
    expect((await student.get(downloadUrl!)).status()).toBe(403);
  } finally {
    for (const window of windows) await window.close(); for (const context of contexts) await context.dispose();
    // Only unique fixture records/files created by this test are removed.
    const stored = await pool.query("select storage_key from course_materials where course_id=$1", [courseId]);
    for (const key of new Set([...files, ...stored.rows.map((row) => row.storage_key as string)])) {
      if (!/^materials\/[a-f0-9-]{36}\.txt$/.test(key)) throw new Error("Unexpected fixture file key.");
      const target = path.resolve(storage, key); if (!target.startsWith(storage + path.sep)) throw new Error("Unsafe fixture cleanup.");
      await unlink(target).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    }
    await pool.query("delete from courses where id=$1", [courseId]);
    for (const id of identities) { await pool.query("delete from audit_logs where actor_auth_user_id=$1", [id]); await pool.query("delete from profiles where auth_user_id=$1", [id]); await pool.query('delete from "user" where id=$1', [id]); }
    await pool.end();
  }
});
