import { expect, test } from "@playwright/test";

test("a successful consultation request redirects to confirmation", async ({ page }) => {
  await page.route("**/api/bookings/availability?date=*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        slots: [
          {
            value: "14:00",
            label: "2:00 pm",
            startsAt: "2026-09-14T19:00:00.000Z",
          },
        ],
      }),
    });
  });
  await page.route("**/api/bookings", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        booking: {
          id: "booking-test",
          status: "pending",
          startsAt: "2026-09-14T19:00:00.000Z",
        },
      }),
    });
  });

  await page.goto("/book");
  await page.getByLabel("Full name").fill("Confirmation Test");
  await page.getByLabel("Email").fill("confirmation@example.com");
  await page.getByLabel("Phone").fill("8765550102");
  await page.getByLabel("Service").selectOption("PMO Consultancy & Training");
  await page.getByLabel("Preferred date").fill("2026-09-14");
  await page.getByLabel("Available time").selectOption("14:00");
  await page.getByLabel("What would make this consultation valuable?").fill("Confirm the new booking journey works correctly.");
  await page.getByLabel("Desired timeline").selectOption("Within 30 days");
  await page.getByLabel(/I consent to CH Elevate/).check();
  await page.getByRole("button", { name: "Request consultation" }).click();

  await expect(page).toHaveURL(/\/book\/confirmation$/);
  await expect(page.getByRole("heading", { name: "Your consultation request is received." })).toBeVisible();
  await expect(page.getByAltText("A smiling Jamaican businesswoman welcoming a consultation request")).toBeVisible();
});
