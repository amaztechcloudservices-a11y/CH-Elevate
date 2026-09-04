import { expect, test } from "@playwright/test";
import { defaultBookingMailSettings } from "../src/lib/booking-mail";

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`booking email settings preview, save and retry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    let saved = structuredClone(defaultBookingMailSettings); let saves = 0; let tests = 0;
    const deliveryStates = new Map([["failed-id", "failed"], ["unknown-id", "unknown"]]);
    const retries: { id: string; confirmUnknown?: boolean }[] = [];
    await page.route("**/api/admin/**", async (route) => {
      const request = route.request(); const url = new URL(request.url());
      if (url.pathname === "/api/admin/access") return route.fulfill({ json: { ok: true } });
      expect(url.pathname).toBe("/api/admin/booking-emails");
      if (request.method() === "POST") {
        const input = request.postDataJSON();
        if (input.action === "save") { saves++; saved = input.data; return route.fulfill({ json: { ok: true, data: saved, updatedAt: `2026-09-03T12:00:0${saves}.000Z` } }); }
        if (input.action === "test") { tests++; expect(input).toEqual({ action: "test", kind: "approved" }); return route.fulfill({ json: { ok: true, result: { state: "accepted" } } }); }
        retries.push(input); deliveryStates.set(input.id, "accepted");
        return route.fulfill({ json: { ok: true, result: { state: "accepted" } } });
      }
      const deliveries = [...deliveryStates].filter(([, state]) => url.searchParams.get("attention") !== "true" || state !== "accepted").map(([id, state]) => ({ id, bookingId: "11111111-1111-4111-8111-111111111111", kind: id === "failed-id" ? "received" : "approved", state, attempts: 1, errorCode: state === "failed" ? "SMTP_NOT_CONFIGURED" : state === "unknown" ? "DELIVERY_UNCERTAIN" : null, updatedAt: "2026-09-03T12:00:00Z", customerName: "Fixture Client", service: "Discovery" }));
      return route.fulfill({ json: { ok: true, data: saved, updatedAt: "2026-09-03T12:00:00Z", deliveries, total: deliveries.length, pageSize: 50, smtpConfigured: true, testRecipient: "admin@example.test" } });
    });
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/admin/bookings?tab=emails");
    await expect(page.getByRole("heading", { name: "Email notifications.", exact: true })).toBeVisible();
    await expect(page.locator(".cms-panel-heading h1")).toHaveCSS("font-size", "27px");
    await expect(page.locator(".cms-panel-heading h1")).toHaveCSS("color", "rgb(0, 87, 81)");
    await page.getByLabel("Sender name", { exact: true }).fill("CH Elevate Booking Team");
    await page.getByLabel("Reply-to email", { exact: true }).fill("reply@example.test");
    await page.getByRole("combobox", { name: "Message template", exact: true }).selectOption("approved");
    await page.getByLabel("Email subject", { exact: true }).fill("Approved {{unknown}}");
    await page.getByRole("button", { name: "Save email settings" }).click();
    await expect(page.getByRole("status", { name: "Email operation result" })).toContainText("supported template variables"); expect(saves).toBe(0);
    await page.getByLabel("Email subject", { exact: true }).fill("Approved {{eventTitle}}");
    await page.getByRole("textbox", { name: "Email message", exact: true }).fill("Hello {{customerName}},\nYour booking is approved. <b>Literal text</b>");
    await expect(page.locator(".booking-mail-preview")).toContainText("Hello Example Client");
    await expect(page.locator(".booking-mail-preview b")).toHaveCount(0);
    expect(await page.locator(".booking-email-admin").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.getByRole("button", { name: "Save email settings" }).click();
    await expect(page.getByRole("status", { name: "Email operation result" })).toHaveText("Booking email settings saved.");
    expect(saved.senderName).toBe("CH Elevate Booking Team"); expect(saved.replyTo).toBe("reply@example.test");
    await page.reload();
    await expect(page.getByLabel("Sender name", { exact: true })).toHaveValue("CH Elevate Booking Team");
    await page.getByRole("combobox", { name: "Message template", exact: true }).selectOption("approved");
    await page.getByRole("button", { name: "Send test email to me" }).click();
    await expect(page.getByRole("status", { name: "Email operation result" })).toContainText("Accepted by mail server"); expect(tests).toBe(1);
    const history = page.getByRole("region", { name: "Booking email delivery history" });
    const uncertain = history.locator("article").filter({ has: page.getByRole("heading", { name: "Booking approved", exact: true }) });
    await uncertain.getByRole("button", { name: "Retry delivery" }).click();
    await expect(uncertain).toContainText("could send a duplicate");
    await uncertain.getByRole("button", { name: "Cancel retry" }).click(); expect(retries).toHaveLength(0);
    await uncertain.getByRole("button", { name: "Retry delivery" }).click();
    await uncertain.getByRole("button", { name: "Retry despite duplicate risk" }).click();
    await expect(uncertain).toHaveCount(0); expect(retries[0].confirmUnknown).toBe(true);
    await history.getByRole("button", { name: "Retry delivery" }).click();
    await expect(history).toContainText("No messages in this view.");
    await page.getByLabel("Only messages needing attention").uncheck();
    await expect(history.getByText("Accepted by mail server", { exact: true })).toHaveCount(2);
    await page.getByLabel("Sender name", { exact: true }).fill("Unsaved name");
    await page.getByRole("button", { name: "Reload saved settings" }).click();
    await page.getByRole("button", { name: "Keep editing" }).click();
    await expect(page.getByLabel("Sender name", { exact: true })).toHaveValue("Unsaved name");
    await page.getByRole("button", { name: "Reload saved settings" }).click();
    await page.getByRole("button", { name: "Discard edits and reload" }).click();
    await expect(page.getByLabel("Sender name", { exact: true })).toHaveValue("CH Elevate Booking Team");
    if (width === 320 || width === 1440) { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `test-results/booking-emails-${width}.png`, fullPage: true }); }
    expect(errors).toEqual([]);
  });
}
