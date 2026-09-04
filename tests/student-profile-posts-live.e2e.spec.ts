import { expect, request as playwrightRequest, test } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
test.use({ trace: "off", screenshot: "off" });
test("real admin posts reach only the selected student's login profile", async ({ browser }) => {
  test.skip(process.env.BOOKING_DB_TESTS !== "1", "Local fixture opt-in required.");
  const baseURL = process.env.COURSE_E2E_BASE_URL || "http://localhost:3001"; const url = new URL(process.env.DATABASE_URL!);
  if (baseURL !== "http://localhost:3001" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web") throw new Error("Verified local server/database required.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL }); const suffix = randomUUID();
  const requests: Awaited<ReturnType<typeof playwrightRequest.newContext>>[] = []; const windows: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  const userIds: string[] = []; const passwords: string[] = [];
  const emails = ["admin", "student", "outsider"].map((role) => `profile-live-${role}-${suffix}@example.test`);
  try {
    for (const [index, email] of emails.entries()) {
      const request = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } }); requests.push(request);
      const password = randomBytes(24).toString("hex"); passwords.push(password);
      const result = await request.post("/api/auth/sign-up/email", { data: { name: `Profile fixture ${index}`, email, password } });
      expect(result.status()).toBe(200); userIds.push((await result.json()).user.id);
    }
    await pool.query("update profiles set role='client_admin' where auth_user_id=$1", [userIds[0]]);
    const profileId = (await pool.query("select id from profiles where auth_user_id=$1", [userIds[1]])).rows[0].id;
    const adminWindow = await browser.newContext({ baseURL, storageState: await requests[0].storageState() }); windows.push(adminWindow);
    const admin = await adminWindow.newPage(); await admin.goto("/admin/courses"); await admin.getByRole("button", { name: "Student profiles", exact: true }).click();
    await admin.getByLabel("Search students by name or email").fill(emails[1]); await admin.getByRole("button", { name: "Find students" }).click();
    await admin.getByRole("button", { name: `Profile fixture 1 ${emails[1]}` }).click(); await admin.getByRole("button", { name: "Add student update" }).click();
    let editor = admin.getByRole("dialog"); await editor.getByLabel("Update title").fill("Your private course update"); await editor.getByLabel("Message to student").fill("Please review your preparation workbook.");
    await editor.getByRole("button", { name: "Save student update" }).click(); await expect(editor).toHaveCount(0);
    await expect(admin.locator(".student-post-admin").getByText("Draft", { exact: true })).toBeVisible();
    expect((await pool.query("select is_published from student_posts where profile_id=$1", [profileId])).rows[0].is_published).toBe(false);
    const studentWindow = await browser.newContext({ baseURL }); windows.push(studentWindow); const student = await studentWindow.newPage();
    await student.goto("/portal/login"); await student.getByLabel("Email address").fill(emails[1]); await student.getByLabel("Password", { exact: true }).fill(passwords[1]);
    await student.getByRole("button", { name: "Sign in", exact: true }).click(); await student.waitForURL("**/portal/profile");
    await expect(student.getByRole("heading", { name: "Personal profile" })).toBeVisible(); await expect(student.getByText("Your private course update", { exact: true })).toHaveCount(0);
    await admin.getByRole("button", { name: "Edit update Your private course update" }).click(); editor = admin.getByRole("dialog");
    await editor.getByLabel("Publish on student profile").check(); await editor.getByRole("button", { name: "Save student update" }).click(); await expect(editor).toHaveCount(0);
    await student.reload(); await expect(student.getByRole("heading", { name: "Your private course update" })).toBeVisible();
    expect((await requests[1].get(`/api/admin/student-posts?profileId=${profileId}`)).status()).toBe(403);
    expect((await requests[1].post("/api/admin/student-posts", { data: { action: "create", profileId, data: { title: "Not permitted", body: "Student write", isPublished: true } } })).status()).toBe(403);
    const outsider = await requests[2].get(`/api/portal?scope=profile&profileId=${profileId}`); expect((await outsider.json()).data.posts).toEqual([]);
    await admin.reload(); await admin.getByRole("button", { name: "Student profiles", exact: true }).click(); await admin.getByLabel("Search students by name or email").fill(emails[1]); await admin.getByRole("button", { name: "Find students" }).click(); await admin.getByRole("button", { name: `Profile fixture 1 ${emails[1]}` }).click();
    await admin.getByRole("button", { name: "Edit update Your private course update" }).click(); editor = admin.getByRole("dialog");
    await editor.getByLabel("Message to student").fill("Updated instructions for this student only."); await editor.getByRole("button", { name: "Save student update" }).click(); await expect(editor).toHaveCount(0);
    await student.reload(); await expect(student.getByText("Updated instructions for this student only.", { exact: true })).toBeVisible();
    await student.getByLabel("Job title", { exact: true }).fill("Local profile verification"); await student.getByRole("button", { name: "Save profile", exact: true }).click(); await expect(student.getByRole("status").filter({ hasText: "Profile updated successfully." })).toBeVisible();
    expect((await pool.query("select job_title from profiles where id=$1", [profileId])).rows[0].job_title).toBe("Local profile verification");
    await admin.getByRole("button", { name: "Remove update Your private course update" }).click(); await admin.getByRole("button", { name: "Confirm remove update" }).click();
    await expect(admin.getByText("Student update removed.", { exact: true })).toBeVisible(); await student.reload(); await expect(student.getByText("Your private course update", { exact: true })).toHaveCount(0);
    expect((await pool.query("select id from student_posts where profile_id=$1", [profileId])).rows).toHaveLength(0);
    await student.getByRole("button", { name: "Sign out", exact: true }).click(); await student.waitForURL("**/portal/login");
  } finally {
    for (const window of windows) await window.close(); for (const request of requests) await request.dispose();
    for (const id of userIds) { await pool.query("delete from audit_logs where actor_auth_user_id=$1", [id]); await pool.query("delete from profiles where auth_user_id=$1", [id]); await pool.query('delete from "user" where id=$1', [id]); }
    await pool.end();
  }
});
