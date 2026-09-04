import { expect, test } from "@playwright/test";
import { defaultCmsSnapshot } from "../src/lib/cms";
import { defaultWebsiteCms } from "../src/lib/website-cms";

const courseData = {
  courses: [], offerings: [], registrations: [], materials: [], recentActivity: [],
  metrics: { pending: 0, upcoming: 0, waitlisted: 0, outstandingCents: 0 },
};

for (const width of [320, 768, 1024, 1440]) {
  for (const workspace of ["bookings", "courses", "website"] as const) {
    test(`${workspace} is isolated and switchable at ${width}px`, async ({ page }) => {
      const requested: string[] = [];
      await page.route("**/api/admin/**", async (route) => {
        expect(route.request().method()).toBe("GET");
        const path = new URL(route.request().url()).pathname;
        requested.push(path);
        const data = path === "/api/admin/cms" ? defaultWebsiteCms()
          : path === "/api/admin/bookings/calendar" ? { bookings: [], events: [], blocks: [], days: [], timeZone: "America/Jamaica", today: "2026-09-03" }
          : path === "/api/admin/booking-settings" ? defaultCmsSnapshot.availability
            : path === "/api/admin/courses" ? courseData : [];
        await route.fulfill({ json: { ok: true, data } });
      });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/admin/${workspace}`, { waitUntil: "networkidle" });
      await expect(page.locator("main.cms-admin")).toHaveAttribute("data-workspace", workspace);
      const sidebar = page.getByRole("navigation", { name: "Administration sections", exact: true });
      const labels = await sidebar.locator("button").allTextContents();
      if (workspace === "bookings") {
        expect(labels.map((label) => label.trim())).toEqual(["Bookings", "Booking events", "Email notifications"]);
        expect(requested).not.toContain("/api/admin/cms");
        expect(requested).not.toContain("/api/admin/courses");
        await expect(page.getByRole("button", { name: "Save & publish" })).toHaveCount(0);
      } else if (workspace === "courses") {
        expect(labels.map((label) => label.trim())).toEqual(["Courses"]);
        expect(requested).not.toContain("/api/admin/cms");
        expect(requested).not.toContain("/api/admin/bookings");
        await expect(page.getByRole("heading", { name: "Courses & registration." })).toBeVisible();
      } else {
        expect(labels.join(" ")).not.toMatch(/Bookings|Courses|Availability/);
        expect(requested).not.toContain("/api/admin/bookings");
        expect(requested).not.toContain("/api/admin/courses");
      }
      const switcher = page.getByRole("navigation", { name: "Switch administration workspace" });
      const links = switcher.getByRole("link");
      await expect(links).toHaveCount(2);
      await expect(links.first()).toBeVisible();
      await expect(links.last()).toBeVisible();
      expect(await switcher.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      const destination = await links.first().getAttribute("href");
      await links.first().focus();
      await page.keyboard.press("Enter");
      await page.waitForURL(`**${destination}`);
      await expect(page.locator("main.cms-admin")).not.toHaveAttribute("data-workspace", workspace);
      if (width === 1440 || width === 320) {
        await page.goto(`/admin/${workspace}`, { waitUntil: "networkidle" });
        await page.screenshot({ path: `test-results/workspace-${workspace}-${width}.png` });
      }
    });
  }
}

test("legacy links arrive at their dedicated workspace", async ({ request }) => {
  for (const [oldPath, destination] of [
    ["/admin?tab=bookings", "/admin/bookings"],
    ["/admin?tab=courses", "/admin/courses"],
    ["/admin?tab=availability", "/admin/bookings?tab=events"],
    ["/admin?tab=global", "/admin/website?tab=global"],
  ]) {
    const response = await request.get(oldPath, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe(destination);
  }
});

test("workspace APIs reject unauthenticated requests", async ({ request }) => {
  for (const path of ["access", "booking-settings", "booking-events", "booking-emails", "bookings", "courses", "cms"]) {
    expect((await request.get(`/api/admin/${path}`)).status()).toBe(401);
  }
  expect((await request.patch("/api/admin/booking-settings", { data: defaultCmsSnapshot.availability })).status()).toBe(401);
  expect((await request.post("/api/admin/booking-emails", { data: { action: "test", kind: "approved" } })).status()).toBe(401);
});

test("desktop workspaces raise the shared sign-out control", async ({ page }) => {
  await page.route("**/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = path === "/api/admin/cms" ? defaultWebsiteCms()
      : path === "/api/admin/bookings/calendar" ? { bookings: [], events: [], blocks: [], days: [], timeZone: "America/Jamaica", today: "2026-09-03" }
      : path === "/api/admin/booking-settings" ? defaultCmsSnapshot.availability
        : path === "/api/admin/courses" ? courseData : [];
    await route.fulfill({ json: { ok: true, data } });
  });

  await page.setViewportSize({ width: 1116, height: 779 });
  const expectedMarginTop = { bookings: 460.53, courses: 560.51, website: 252.58 };
  for (const workspace of ["bookings", "courses", "website"] as const) {
    await page.goto(`/admin/${workspace}`, { waitUntil: "networkidle" });
    const signOut = page.getByRole("button", { name: "Sign out" });
    await expect(signOut).toBeVisible();
    const marginTop = await signOut.evaluate((element) => Number.parseFloat(getComputedStyle(element).marginTop));
    expect(Math.abs(marginTop - expectedMarginTop[workspace])).toBeLessThanOrEqual(3);
  }

  await page.goto("/admin/bookings", { waitUntil: "networkidle" });
  const desktopSidebar = page.locator(".cms-admin__sidebar");
  const initialSidebarTop = await desktopSidebar.evaluate((element) => element.getBoundingClientRect().top);
  expect(initialSidebarTop).toBeCloseTo(84, 0);
  await page.evaluate(() => window.scrollTo({ top: 500 }));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const scrolledSidebarTop = await desktopSidebar.evaluate((element) => element.getBoundingClientRect().top);
  expect(scrolledSidebarTop).toBeCloseTo(initialSidebarTop, 0);

  await page.setViewportSize({ width: 768, height: 779 });
  await page.goto("/admin/bookings", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCSS("margin-bottom", "0px");
});
