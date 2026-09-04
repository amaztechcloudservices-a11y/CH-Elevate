import { expect, test } from "@playwright/test";
import type { StudentPost } from "../src/lib/student-posts";
const profileId = "11111111-1111-4111-8111-111111111111";
const courseId = "22222222-2222-4222-8222-222222222222";
test.use({ trace: "off" });
for (const width of [320, 375, 768, 1024, 1440]) {
  test(`student profile updates and documents at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    let posts: StudentPost[] = []; let failSave = true;
    await page.route("**/api/admin/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/admin/students") {
        await route.fulfill({ json: { ok: true, data: [{ id: profileId, name: "Test Student", email: "student@example.test" }], total: 1, page: 1 } }); return;
      }
      if (url.pathname === "/api/admin/student-posts") {
        if (route.request().method() === "POST") {
          if (failSave) { failSave = false; await route.fulfill({ status: 503, json: { error: { message: "Temporary failure. Please retry." } } }); return; }
          const input = route.request().postDataJSON(); expect(input.profileId).toBe(profileId);
          if (input.action === "delete") posts = [];
          else posts = [{ ...input.data, id: profileId, createdAt: "2026-09-03T12:00:00.000Z", updatedAt: new Date().toISOString() }];
          await route.fulfill({ json: { ok: true } }); return;
        }
        await route.fulfill({ json: { ok: true, data: { posts } } }); return;
      }
      await route.fulfill({ json: { ok: true, data: { courses: [], offerings: [], registrations: [], materials: [], recentActivity: [], metrics: { pending: 0, upcoming: 0, waitlisted: 0, outstandingCents: 0 } } } });
    });
    await page.goto("/admin/courses"); await page.getByRole("button", { name: "Student profiles", exact: true }).click();
    await page.getByLabel("Search students by name or email").fill("student@example.test"); await page.getByRole("button", { name: "Find students" }).click();
    await page.getByRole("button", { name: "Test Student student@example.test" }).click();
    await page.getByRole("button", { name: "Add student update" }).click();
    const dialog = page.getByRole("dialog", { name: "New student update" });
    await expect(dialog.getByLabel("Update title")).toBeFocused();
    await dialog.getByLabel("Update title").fill("Your preparation checklist");
    await dialog.getByLabel("Message to student").fill("Bring your workbook.\n<script>Plain text, not code</script>");
    await dialog.getByLabel("Publish on student profile").check();
    await dialog.getByRole("button", { name: "Save student update" }).click(); await expect(dialog.getByRole("alert")).toContainText("Temporary failure");
    await expect(dialog.getByLabel("Update title")).toHaveValue("Your preparation checklist");
    await dialog.screenshot({ path: `test-results/student-post-editor-${width}.png` });
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.getByRole("button", { name: "Save student update" }).click(); await expect(dialog).toHaveCount(0);
    await expect(page.locator(".student-post-admin").getByRole("heading", { name: "Your preparation checklist" })).toBeVisible();
    await page.getByRole("button", { name: "Edit update Your preparation checklist" }).click();
    const edit = page.getByRole("dialog", { name: "Edit student update" });
    await edit.getByLabel("Update title").fill("Unsaved change");
    page.once("dialog", (prompt) => prompt.dismiss()); await page.keyboard.press("Escape"); await expect(edit).toBeVisible();
    page.once("dialog", (prompt) => prompt.accept()); await page.keyboard.press("Escape"); await expect(edit).toHaveCount(0);
    await page.route("**/api/portal?scope=profile", (route) => route.fulfill({ json: { ok: true, data: {
      user: { name: "Test Student", email: "student@example.test", timeZone: "America/Jamaica" }, memberships: [], posts,
      registrations: [{ participant: { id: profileId, email: "student@example.test", status: "approved", attendance: "not_recorded" }, registration: { id: profileId, paymentStatus: "unpaid", amountDueCents: 15000 }, course: { id: courseId, title: "Leadership practice" }, offering: { id: courseId, code: "LEAD-01", startsAt: "2097-10-01T14:00:00Z", endsAt: "2097-10-02T14:00:00Z", timeZone: "America/Jamaica", currency: "JMD", venue: "Online", joiningInstructions: "Use your invitation to join." } }],
      materials: [{ id: courseId, courseId, title: "Course workbook", originalFilename: "workbook.pdf", sizeBytes: 2048, version: 1 }],
      invoices: [{ id: profileId, registrationId: profileId, documentType: "invoice", reference: "INV-TEST", amountCents: 15000, dueAt: null }],
      certificates: [{ id: profileId, certificateNumber: "CERT-TEST", courseTitle: "Completed course", issuedAt: "2026-09-03T12:00:00Z" }],
    } } }));
    await page.route("**/api/portal/learning", (route) => route.fulfill({ json: { ok: true, data: [] } }));
    await page.goto("/portal/profile");
    await expect(page.getByRole("heading", { name: "Your preparation checklist" })).toBeVisible();
    await expect(page.locator("#profile-updates .student-post-body")).toContainText("<script>Plain text, not code</script>");
    await expect(page.locator("#profile-updates script")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Download Course workbook" })).toHaveAttribute("href", `/api/portal/downloads/material/${courseId}`);
    await expect(page.getByRole("link", { name: "Download INV-TEST" })).toHaveAttribute("href", `/api/portal/downloads/invoice/${profileId}`);
    await expect(page.getByRole("link", { name: "Download certificate for Completed course" })).toHaveAttribute("href", `/api/portal/downloads/certificate/${profileId}`);
    await expect(page.getByRole("heading", { name: "Your enrolments" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator("#profile-updates").screenshot({ path: `test-results/student-profile-updates-${width}.png` });
    await page.locator("#profile-documents").screenshot({ path: `test-results/student-profile-documents-${width}.png` });
    await page.goto("/admin/courses"); await page.getByRole("button", { name: "Student profiles", exact: true }).click();
    await page.getByRole("button", { name: "Test Student student@example.test" }).click();
    await page.getByRole("button", { name: "Remove update Your preparation checklist" }).click();
    await page.getByRole("button", { name: "Confirm remove update" }).click();
    await expect(page.getByText("No updates posted to this student’s profile.")).toBeVisible();
    expect(posts).toEqual([]); expect(errors).toEqual([]);
  });
}
