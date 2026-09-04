import { expect, test } from "@playwright/test";
const courseId = "11111111-1111-4111-8111-111111111111";
const offeringId = "22222222-2222-4222-8222-222222222222";
const studentId = "33333333-3333-4333-8333-333333333333";
for (const width of [320, 375, 768, 1024, 1440]) {
  test(`material assignment and retry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); let uploads = 0;
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/admin/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/materials")) {
        uploads++; expect(route.request().postData()).toContain(studentId);
        await route.fulfill({ status: uploads === 1 ? 503 : 201, json: uploads === 1 ? { error: { message: "Temporary upload failure. Please try again." } } : { ok: true, data: { id: "fixture-material", version: 1 } } }); return;
      }
      await route.fulfill({ json: { ok: true, data: {
        courses: [{ id: courseId, title: "Leadership foundations" }], offerings: [{ courseTitle: "Leadership foundations", approvedSeats: 1, offering: { id: offeringId, courseId, code: "OCTOBER", startsAt: "2097-10-01", endsAt: "2097-10-02" } }],
        registrations: [{ courseId, offeringId, participantProfileId: studentId, participantId: "fixture-participant", participantName: "Student Example", participantEmail: "student@example.test", participantStatus: "approved", attendance: "not_recorded", startsAt: "2097-10-01", courseTitle: "Leadership foundations", offeringCode: "OCTOBER", registration: { id: "fixture-registration", status: "approved", paymentStatus: "unpaid" } }],
        materials: [], recentActivity: [], metrics: { pending: 0, upcoming: 1, waitlisted: 0, outstandingCents: 0 },
      } } });
    });
    await page.goto("/admin/courses"); await page.getByRole("button", { name: "Materials", exact: true }).click();
    const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Upload and assign material" }) });
    await form.getByLabel("Material title", { exact: true }).fill("Personal leadership workbook"); await form.getByLabel("Assign to course").selectOption(courseId);
    await form.getByLabel("Specific offering (optional)").selectOption(offeringId); await form.getByLabel("Student assignment").selectOption(studentId);
    await form.getByLabel("File", { exact: true }).setInputFiles({ name: "workbook.txt", mimeType: "text/plain", buffer: Buffer.from("Private workbook") });
    const send = form.getByRole("button", { name: "Upload secure material" }); await send.click(); await expect(form.getByRole("alert")).toContainText("Temporary upload failure");
    await expect(form.getByLabel("Material title", { exact: true })).toHaveValue("Personal leadership workbook"); await expect(form.getByLabel("Student assignment")).toHaveValue(studentId);
    expect(await form.getByLabel("File", { exact: true }).evaluate((element: HTMLInputElement) => element.files?.length)).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await form.getByLabel("Material title", { exact: true }).evaluate((element) => getComputedStyle(element).fontSize)).toBe("16px");
    await form.screenshot({ path: `test-results/course-material-upload-${width}.png` });
    await send.click(); await expect(form.getByRole("status")).toContainText("version 1"); await expect(form.getByLabel("Material title", { exact: true })).toHaveValue("");
    expect(errors).toEqual([]);
  });
}
