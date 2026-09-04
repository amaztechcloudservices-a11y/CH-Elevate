import { expect, test } from "@playwright/test";
import { summarizeCourseAnalytics, type AnalyticsFilters } from "../src/lib/course-analytics";
const courseId = "11111111-1111-4111-8111-111111111111";
test.use({ trace: "off" });
for (const width of [320, 375, 768, 1024, 1440]) {
  test(`analytics filters, charts and recovery at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); let fail = false; let calls = 0;
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/admin/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/analytics")) {
        calls++; if (fail) return route.fulfill({ status: 503, json: { error: { message: "Analytics temporarily unavailable." } } });
        const filters = Object.fromEntries(url.searchParams) as AnalyticsFilters;
        const empty = filters.from === "2099-01-01";
        return route.fulfill({ json: { data: summarizeCourseAnalytics(filters, filters.courseId ? "Leadership development" : "All courses", empty ? [] : [{ courseId, title: "Leadership development", month: filters.from.slice(0, 7), payment: "paid", count: 2 }], empty ? [] : [{ courseId, month: filters.from.slice(0, 7), status: "approved", attendance: "attended", count: 6 }]) } });
      }
      return route.fulfill({ json: { data: { courses: [{ id: courseId, title: "Leadership development" }], offerings: [], registrations: [], materials: [], recentActivity: [], metrics: { pending: 0, upcoming: 0, waitlisted: 0, outstandingCents: 0 } } } });
    });
    await page.goto("/admin/courses"); await page.getByRole("button", { name: "Analytics", exact: true }).click();
    const panel = page.getByRole("region", { name: "Course analytics", exact: true });
    await expect(panel.locator(".analytics-metrics > div").filter({ hasText: "Applications" }).locator("dd")).toHaveText("2");
    await expect(panel.locator(".analytics-metrics > div").filter({ hasText: "Participant records" }).locator("dd")).toHaveText("6");
    const download = panel.getByRole("link", { name: "Download summary CSV" }); const initialHref = await download.getAttribute("href"); const initialCalls = calls;
    await panel.getByRole("combobox", { name: "Analytics course", exact: true }).selectOption(courseId);
    await panel.getByLabel("Submitted from (Jamaica)", { exact: true }).fill("2097-01-01");
    await panel.getByLabel("Submitted through (Jamaica)", { exact: true }).fill("2097-03-31");
    await expect(download).toHaveAttribute("href", initialHref!); expect(calls).toBe(initialCalls);
    const apply = panel.getByRole("button", { name: "Apply analytics filters" }); await apply.focus(); await page.keyboard.press("Enter");
    await expect(download).toHaveAttribute("href", new RegExp(`courseId=${courseId}&from=2097-01-01&to=2097-03-31&format=csv`));
    await expect(panel.getByText("Applied: Leadership development", { exact: true })).toBeVisible();
    await panel.getByText("View monthly data table", { exact: true }).click();
    const table = panel.getByRole("table", { name: "Monthly totals for the applied dates" });
    await expect(table.getByRole("row")).toHaveCount(4); await expect(table.getByRole("row").filter({ hasText: "2097-02" })).toHaveText("2097-0200");
    await expect(panel.getByRole("img", { name: /Monthly applications/ })).toBeVisible();
    await panel.getByText("View monthly data table", { exact: true }).click();
    await panel.getByLabel("Submitted through (Jamaica)", { exact: true }).fill("2096-12-31"); await apply.click();
    await expect(panel.getByRole("alert")).toContainText("end date"); expect(calls).toBe(initialCalls + 1);
    await panel.getByLabel("Submitted through (Jamaica)", { exact: true }).fill("2097-03-31"); fail = true; await apply.click();
    await expect(panel.getByRole("alert")).toContainText("temporarily unavailable"); await expect(download).toHaveCount(0);
    fail = false; await panel.getByRole("button", { name: "Retry analytics" }).click(); await expect(download).toBeVisible();
    await apply.hover(); await expect(apply).toHaveCSS("color", "rgb(255, 255, 255)");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    expect(await panel.getByRole("heading", { name: "Course analytics", exact: true }).evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Sora");
    await panel.screenshot({ path: `test-results/course-analytics-${width}.png`, style: ".ref-header, .cms-admin__topbar { visibility: hidden !important; }" });
    await panel.getByLabel("Submitted from (Jamaica)", { exact: true }).fill("2099-01-01"); await panel.getByLabel("Submitted through (Jamaica)", { exact: true }).fill("2099-02-01"); await apply.click();
    await expect(panel.getByText("No applications were submitted for these filters.")).toBeVisible();
    await expect(panel.locator(".analytics-metrics dd")).toHaveText(["0", "0", "0", "0", "0", "0"]); expect(errors).toEqual([]);
  });
}
