import { expect, test } from "@playwright/test";

for (const width of [320, 768, 880, 881, 1024, 1180]) {
  test(`slide-out close button is unobscured and usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 779 });
    await page.goto("/", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open navigation" }).click();
    const close = page.getByRole("button", { name: "Close navigation" });
    await expect(close.locator("svg.lucide-x")).toBeVisible();
    await page.mouse.move(0, 778);
    await expect(close).toHaveCSS("color", "rgb(255, 255, 255)");
    await expect(close).toHaveCSS("background-color", "rgb(3, 109, 97)");
    expect(await close.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
    await close.click();
    await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeHidden();
    await page.getByRole("button", { name: "Open navigation" }).click();
    await close.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Open navigation" })).toBeFocused();
  });
}

test("close button remains usable after crossing desktop and mobile breakpoints", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator(".ref-menu")).toBeHidden();
  await page.setViewportSize({ width: 1180, height: 779 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.setViewportSize({ width: 768, height: 779 });
  await page.getByRole("button", { name: "Close navigation" }).click();
  await page.setViewportSize({ width: 1181, height: 779 });
  await expect(page.locator(".ref-menu")).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
});
