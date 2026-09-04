import { expect, test } from "@playwright/test";
const registrationId = "11111111-1111-4111-8111-111111111111";
for (const width of [375, 1024, 1440]) {
  test(`payment document validation and retry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); let uploads = 0;
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/admin/**", async (route) => {
      if (new URL(route.request().url()).pathname.endsWith("/invoices")) {
        uploads++; const body = route.request().postData()!;
        expect(body).toContain('name="amountCents"\r\n\r\n12545');
        expect(body).not.toContain('name="amount"');
        await route.fulfill({ status: uploads === 1 ? 503 : 201, json: uploads === 1 ? { error: { message: "Temporary upload failure. Please try again." } } : { ok: true, data: { id: "fixture-invoice" } } }); return;
      }
      await route.fulfill({ json: { ok: true, data: {
        courses: [], offerings: [], materials: [], recentActivity: [],
        registrations: [{ registration: { id: registrationId, status: "approved", paymentStatus: "unpaid", amountDueCents: 12545 }, currency: "CAD", courseTitle: "Leadership", offeringCode: "OCTOBER", startsAt: "2097-10-01", participantId: "fixture-student", participantName: "Student Example", participantEmail: "student@example.test", participantStatus: "approved", attendance: "not_recorded" }],
        metrics: { pending: 0, upcoming: 1, waitlisted: 0, outstandingCents: 0 },
      } } });
    });
    await page.goto("/admin/courses");
    const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Assign payment document" }) });
    await expect(page.getByRole("heading", { name: "Assign payment document" })).toBeVisible();
    await form.getByRole("combobox", { name: "Registration", exact: true }).selectOption(registrationId);
    await form.getByLabel("Reference", { exact: true }).fill("INV-TEST");
    await form.getByLabel("Amount (CAD)", { exact: true }).fill("125.45");
    await form.getByLabel("PDF file").setInputFiles({ name: "invoice.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7 Fixture") });
    await page.evaluate(() => document.fonts.ready);
    expect(await form.getByLabel("Reference", { exact: true }).evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Manrope");
    await form.screenshot({ path: `test-results/course-invoice-form-${width}.png` });
    const send = form.getByRole("button", { name: "Upload document", exact: true });
    await send.click(); await expect(page.getByRole("status")).toContainText("Temporary upload failure");
    await expect(form.getByLabel("Reference", { exact: true })).toHaveValue("INV-TEST");
    expect(await form.getByLabel("PDF file").evaluate((element: HTMLInputElement) => element.files?.length)).toBe(1);
    await send.click(); await expect(page.getByRole("status")).toContainText("Payment document assigned");
    await expect(form.getByLabel("Reference", { exact: true })).toHaveValue("");
    expect(uploads).toBe(2); expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
