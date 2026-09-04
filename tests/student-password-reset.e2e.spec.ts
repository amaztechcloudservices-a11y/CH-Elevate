import { expect, test } from "@playwright/test";

const participantId = "11111111-1111-4111-8111-111111111111";
test.use({ trace: "off" });
for (const width of [375, 1440]) {
  test(`admin password recovery at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let sends = 0;
    await page.route("**/api/admin/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/password-reset")) {
        sends++;
        expect(route.request().postDataJSON()).toEqual({ participantId });
        await route.fulfill({ status: sends === 1 ? 200 : 503, json: sends === 1 ? { ok: true, message: "Reset email sent. The student has 30 minutes to choose a new password." } : { ok: false, error: { message: "Email delivery is not configured. No reset email was sent." } } });
        return;
      }
      await route.fulfill({ json: { ok: true, data: {
        courses: [], offerings: [], materials: [], recentActivity: [],
        registrations: [{ participantId, participantName: "Test Student", participantEmail: "student@example.test", registration: { id: "test-registration", status: "approved", paymentStatus: "unpaid" }, courseTitle: "Test course", offeringCode: "TEST", startsAt: "2026-10-01T12:00:00Z", participantStatus: "approved", attendance: "not_recorded" }],
        metrics: { pending: 0, upcoming: 0, waitlisted: 0, outstandingCents: 0 },
      } } });
    });
    await page.goto("/admin/courses");
    const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Student password recovery" }) });
    const send = form.getByRole("button", { name: "Send password reset email" });
    await expect(send).toBeDisabled();
    await form.getByLabel("Student account").selectOption(participantId);
    await expect(form.getByText("The reset link will be sent to student@example.test.")).toBeVisible();
    await send.click();
    await expect(form.getByRole("status")).toContainText("Reset email sent");
    await send.click();
    await expect(form.getByRole("alert")).toContainText("No reset email was sent");
    expect(await form.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await form.screenshot({ path: `test-results/student-password-reset-${width}.png` });
    expect(sends).toBe(2);
  });
}
test("real admin reset endpoint requires authentication", async ({ request }) => {
  const response = await request.post("/api/admin/courses/password-reset", { data: { participantId } });
  expect(response.status()).toBe(401);
});
