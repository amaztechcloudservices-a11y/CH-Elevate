import { expect, test } from "@playwright/test";
test.use({ trace: "off" });
for (const width of [375, 1440]) {
  test(`invitation activation can recover from transport and validation errors at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 }); let attempts = 0;
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/auth/**", async (route) => {
      if (route.request().url().includes("sign-up")) await route.fulfill({ status: 422, json: { code: "USER_ALREADY_EXISTS", message: "Account exists" } });
      else await route.fulfill({ json: { token: "fixture-token", user: { id: "fixture-user", email: "student@example.test", name: "Student Example" } } });
    });
    await page.route("**/api/portal/invitations/accept", async (route) => {
      attempts++; expect(route.request().postDataJSON()).toEqual({ token: "invitation-fixture-token-for-browser" });
      if (attempts === 1) { await route.abort("failed"); return; }
      await route.fulfill({ status: attempts === 2 ? 409 : 200, json: attempts === 2 ? { ok: false, error: "This invitation is no longer approved." } : { ok: true } });
    });
    await page.route("**/api/portal?scope=profile", (route) => route.fulfill({ json: { ok: true, data: { user: { name: "Student Example", email: "student@example.test", timeZone: "America/Jamaica" }, memberships: [], registrations: [], materials: [], invoices: [], certificates: [], posts: [] } } }));
    await page.route("**/api/portal/learning", (route) => route.fulfill({ json: { ok: true, data: [] } }));
    await page.goto("/portal/activate?token=invitation-fixture-token-for-browser");
    await page.getByLabel("Full name", { exact: true }).fill("Student Example");
    await page.getByLabel("Invited email address").fill("student@example.test");
    await page.getByLabel("Create or enter password").fill("FictionalFixtureOnly42!");
    const send = page.getByRole("button", { name: "Activate portal", exact: true });
    await send.click(); await expect(send).toBeEnabled(); await expect(page.getByRole("status")).toContainText("Please try again");
    await expect(page.getByLabel("Invited email address")).toHaveValue("student@example.test");
    await send.click(); await expect(page.getByRole("status")).toContainText("no longer approved"); await expect(send).toBeEnabled();
    await expect(page.getByRole("link", { name: "Sign in to your portal" })).toHaveAttribute("href", "/portal/login");
    await expect(page.getByRole("link", { name: "Forgot your password?" })).toHaveAttribute("href", "/portal/forgot-password");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await send.click(); await expect(page).toHaveURL(/\/portal\/profile$/);
    expect(attempts).toBe(3); expect(errors).toEqual([]);
  });
}
