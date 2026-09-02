import { expect, test } from "@playwright/test";

test("exposes student and administrator access paths from the public website", async ({ page }) => {
  const consoleProblems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleProblems.push(message.text());
  });

  await page.route("**/api/courses", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: [] }),
  }));

  await page.goto("/programmes#student-registration");
  await expect(page.getByRole("heading", { name: "Register for a programme and manage your learning in one place." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create student account" })).toHaveAttribute("href", "/portal/register");
  await expect(page.getByRole("link", { name: "Student sign in" })).toHaveAttribute("href", "/portal/login");
  await expect(page.getByRole("link", { name: "Student Registration", exact: true })).toHaveAttribute("href", "/portal/register");
  await expect(page.getByRole("link", { name: "Student portal", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Booking administration" })).toHaveAttribute("href", "/admin?tab=bookings");
  await expect(page.getByRole("link", { name: "Course administration" })).toHaveAttribute("href", "/admin?tab=courses");
  await expect(page.getByRole("heading", { name: "Upcoming courses open for registration." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Register for a programme and manage your learning in one place." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  expect(consoleProblems).toEqual([]);
});

test("identifies and preserves each requested administration section through sign-in", async ({ page }) => {
  await page.route("**/api/admin/cms", (route) => route.fulfill({
    status: 401,
    contentType: "application/json",
    body: JSON.stringify({ ok: false }),
  }));
  await page.route("**/api/admin/bookings", (route) => route.fulfill({ status: 401, body: "{}" }));
  await page.route("**/api/admin/submissions", (route) => route.fulfill({ status: 401, body: "{}" }));

  for (const area of [
    { tab: "bookings", heading: "Booking administration sign in.", button: "Sign in to booking administration" },
    { tab: "courses", heading: "Course administration sign in.", button: "Sign in to course administration" },
  ]) {
    await page.goto(`/admin?tab=${area.tab}`);
    await page.waitForURL(/\/admin\/login\?next=/);
    const destination = new URL(page.url()).searchParams.get("next");
    expect(destination).toBe(`/admin?tab=${area.tab}`);
    await expect(page.getByRole("heading", { name: area.heading })).toBeVisible();
    await expect(page.getByRole("button", { name: area.button })).toBeVisible();
    expect((await page.locator(".admin-login > section").boundingBox())?.width).toBeLessThanOrEqual(500);
    expect(Number.parseFloat(await page.locator(".admin-login h1").evaluate((element) => getComputedStyle(element).fontSize))).toBeLessThanOrEqual(35);
    expect((await page.locator(".admin-login input").first().boundingBox())?.height).toBeLessThanOrEqual(44);
  }
});

test("labels and sizes the student login portal heading", async ({ page }) => {
  await page.goto("/portal/login");
  const heading = page.getByRole("heading", { name: "Student Login Portal" });
  await expect(heading).toBeVisible();
  expect(Number.parseFloat(await heading.evaluate((element) => getComputedStyle(element).fontSize))).toBeLessThanOrEqual(31);
  await expect(page.getByRole("link", { name: "Create a student account" })).toHaveAttribute("href", "/portal/register");
});

test("keeps the student account registration form compact and responsive", async ({ page }) => {
  await page.setViewportSize({ width: 1080, height: 779 });
  await page.goto("/portal/register");

  const card = page.locator(".portal-auth--register > section");
  const heading = page.getByRole("heading", { name: "Create your student account" });
  const firstInput = page.locator(".portal-auth--register input").first();

  await expect(card).toBeVisible();
  expect((await card.boundingBox())?.width).toBeLessThanOrEqual(460);
  expect(Number.parseFloat(await heading.evaluate((element) => getComputedStyle(element).fontSize))).toBeLessThanOrEqual(31);
  expect((await firstInput.boundingBox())?.height).toBeLessThanOrEqual(42);

  await page.setViewportSize({ width: 320, height: 740 });
  await page.reload();
  const mobileCard = await card.boundingBox();
  expect(mobileCard?.width).toBeLessThanOrEqual(288);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
