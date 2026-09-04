import { expect, test } from "@playwright/test";
const offeringId = "11111111-1111-4111-8111-111111111111";
for (const width of [375, 1024, 1440]) {
  test(`organisation roster upload and retry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); let uploads = 0;
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/admin/**", async (route) => {
      if (new URL(route.request().url()).pathname.endsWith("/roster")) {
        uploads++; expect(route.request().postData()).toContain('name="offeringId"\r\n\r\n' + offeringId);
        await route.fulfill({ status: uploads === 1 ? 503 : 201, json: uploads === 1 ? { error: { message: "Temporary import failure. Please try again." } } : { ok: true, data: { id: "fixture-roster", participantCount: 2 } } }); return;
      }
      await route.fulfill({ json: { ok: true, data: { courses: [], registrations: [], materials: [], recentActivity: [], offerings: [{ courseTitle: "Leadership", approvedSeats: 0, offering: { id: offeringId, code: "OCTOBER", startsAt: "2097-10-01", endsAt: "2097-10-02", currency: "CAD" } }], metrics: { pending: 0, upcoming: 1, waitlisted: 0, outstandingCents: 0 } } } });
    });
    await page.goto("/admin/courses");
    const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Import organisation roster" }) });
    await form.getByRole("combobox", { name: "Offering", exact: true }).selectOption(offeringId);
    await form.getByLabel("Organisation", { exact: true }).fill("Example organisation");
    await form.getByLabel("Coordinator name", { exact: true }).fill("Coordinator Example");
    await form.getByLabel("Coordinator email", { exact: true }).fill("coordinator@example.test");
    await form.getByLabel("Roster CSV").setInputFiles({ name: "roster.csv", mimeType: "text/csv", buffer: Buffer.from('name,email\n"Henry, Arvette",student1@example.test\nStudent Two,student2@example.test') });
    const send = form.getByRole("button", { name: "Import roster", exact: true });
    await send.click(); await expect(page.getByRole("status")).toContainText("Temporary import failure");
    await expect(form.getByLabel("Organisation", { exact: true })).toHaveValue("Example organisation");
    expect(await form.getByLabel("Roster CSV").evaluate((element: HTMLInputElement) => element.files?.length)).toBe(1);
    await page.evaluate(() => document.fonts.ready);
    expect(await form.getByLabel("Organisation", { exact: true }).evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Manrope");
    await form.screenshot({ path: `test-results/course-roster-form-${width}.png` });
    await send.click(); await expect(page.getByRole("status")).toContainText("2 participants imported for administrator review");
    await expect(form.getByLabel("Organisation", { exact: true })).toHaveValue("");
    expect(uploads).toBe(2); expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
