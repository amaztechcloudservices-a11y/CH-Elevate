import { expect, test } from "@playwright/test";

import { defaultCmsSnapshot } from "../src/lib/cms";
import { defaultWebsiteCms } from "../src/lib/website-cms";
import { defaultBookingMailSettings } from "../src/lib/booking-mail";

test.beforeEach(async ({ page }) => {
  // Layout-only fixtures: no administrator credentials or customer data.
  await page.route("**/api/admin/**", async (route) => {
    if (route.request().method() !== "GET") {
      throw new Error("Layout tests must not mutate administration data.");
    }
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/admin/booking-emails") return route.fulfill({ json: { data: defaultBookingMailSettings, updatedAt: null, deliveries: [], total: 0, pageSize: 50, smtpConfigured: false, testRecipient: "fixture@example.test" } });
    const data = path === "/api/admin/cms" ? defaultWebsiteCms()
      : path === "/api/admin/bookings/calendar" ? { bookings: [], events: [], blocks: [], days: [], timeZone: "America/Jamaica", today: "2026-09-03" }
      : path === "/api/admin/booking-settings" ? defaultCmsSnapshot.availability
      : path === "/api/admin/courses" ? {
        courses: [], offerings: [], registrations: [], materials: [], recentActivity: [],
        metrics: { pending: 0, upcoming: 0, waitlisted: 0, outstandingCents: 0 },
      } : [];
    await route.fulfill({ json: { ok: true, data } });
  });
});

for (const width of [320, 768, 1024, 1398, 1440]) {
  test(`Header and footer panel typography at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 779 });
    await page.goto("/admin?tab=global", { waitUntil: "networkidle" });
    const heading = page.locator(".cms-panel-heading--global");
    await expect(heading.locator("h1")).toHaveCSS("font-size", "27px");
    await expect(heading.locator("h1")).toHaveCSS("font-weight", "500");
    await expect(heading.locator("h1")).toHaveCSS("color", "rgb(0, 87, 81)");
    await expect(heading.locator("p")).toHaveCSS("color", "rgb(44, 45, 48)");
    await expect(heading.locator("p")).toHaveCSS("max-width", "534px");
    const copy = await heading.locator("p").evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        width: element.getBoundingClientRect().width,
        lineHeight: parseFloat(style.lineHeight),
        fontSize: parseFloat(style.fontSize),
        fits: element.scrollWidth <= element.clientWidth,
      };
    });
    expect(copy.width).toBeLessThanOrEqual(534);
    expect(copy.lineHeight).toBeCloseTo(copy.fontSize * 1.75 - 5, 1);
    expect(copy.fits).toBe(true);
    await expect(page.locator(".cms-admin__sidebar img")).toHaveCount(0);
    await expect(page.locator(".ref-header .brand-logo__image")).toBeVisible();
    if (width === 1398) {
      await page.screenshot({ path: "test-results/admin-global-desktop.png" });
    }
    if (width === 320) {
      await page.screenshot({ path: "test-results/admin-global-mobile.png" });
    }
  });
}

for (const tab of ["overview", "global", "navigation", "hero", "pages", "forms", "bookings", "courses", "inbox", "availability", "emails"]) {
  test(`shared heading style on ${tab} sidebar page`, async ({ page }) => {
    await page.setViewportSize({ width: 1136, height: 779 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/admin?tab=${tab}`, { waitUntil: "networkidle" });
    const heading = page.locator(".cms-panel-heading");
    await expect(heading.locator("h1")).toHaveCSS("font-size", "27px");
    await expect(heading.locator("h1")).toHaveCSS("font-weight", "500");
    await expect(heading.locator("h1")).toHaveCSS("color", "rgb(0, 87, 81)");
    await expect(heading.locator("p")).toHaveCSS("color", "rgb(44, 45, 48)");
    await expect(heading.locator("p")).toHaveCSS("max-width", tab === "global" ? "534px" : "680px");
    expect(await heading.locator("h1").evaluate(async (element) => {
      await document.fonts.ready;
      return document.fonts.check(`500 27px ${getComputedStyle(element).fontFamily}`);
    })).toBe(true);
    expect(errors).toEqual([]);
  });
}
