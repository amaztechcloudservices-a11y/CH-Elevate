import { expect, test } from "@playwright/test";
import { defaultWebsiteCms, type WebsiteCmsSnapshot } from "../src/lib/website-cms";

test("website hero and page-section images are selected from the device and retained for publishing", async ({ page }) => {
  let cms: WebsiteCmsSnapshot = defaultWebsiteCms();
  let upload = 0;
  await page.route("**/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/admin/images") {
      upload += 1;
      return route.fulfill({ status: 201, json: { ok: true, data: { url: `/api/images/33333333-3333-4333-8333-${String(upload).padStart(12, "0")}.png` } } });
    }
    if (path === "/api/admin/cms") {
      if (route.request().method() === "PATCH") cms = route.request().postDataJSON() as WebsiteCmsSnapshot;
      return route.fulfill({ json: { ok: true, data: cms } });
    }
    return route.fulfill({ json: { ok: true, data: [] } });
  });

  await page.goto("/admin/website?tab=hero");
  const firstSlide = page.locator(".cms-stack .cms-card").first();
  await expect(firstSlide.getByLabel("Image path or URL")).toHaveCount(0);
  await firstSlide.getByLabel("Hero image").setInputFiles({ name: "hero.png", mimeType: "image/png", buffer: Buffer.from("fixture image") });
  await expect(firstSlide.getByText("Image uploaded. Save this form to use it.")).toBeVisible();
  await page.getByRole("button", { name: "Save & publish", exact: true }).click();
  await expect(page.locator(".cms-admin__notice")).toContainText("Published.");
  expect(cms.heroSlides[0].imageUrl).toBe("/api/images/33333333-3333-4333-8333-000000000001.png");

  await page.getByRole("button", { name: "Page sections", exact: true }).click();
  await page.getByRole("button", { name: "Add section", exact: true }).click();
  const firstSection = page.locator(".cms-stack .cms-card").first();
  await expect(firstSection.getByLabel("Background image path or URL")).toHaveCount(0);
  await firstSection.getByLabel("Background image", { exact: true }).setInputFiles({ name: "section.png", mimeType: "image/png", buffer: Buffer.from("fixture image") });
  await expect(firstSection.getByText("Image uploaded. Save this form to use it.")).toBeVisible();
  await page.getByRole("button", { name: "Save & publish", exact: true }).click();
  await expect(page.locator(".cms-admin__notice")).toContainText("Published.");
  expect(cms.pages[0].sections[0].imageUrl).toBe("/api/images/33333333-3333-4333-8333-000000000002.png");
  expect(upload).toBe(2);
});

test("website overview stat values are white at rest and black on hover", async ({ page }) => {
  await page.route("**/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: { ok: true, data: path === "/api/admin/cms" ? defaultWebsiteCms() : [] } });
  });
  await page.goto("/admin/website");
  const card = page.getByRole("button", { name: /Public forms/ });
  const value = card.locator("strong");
  await expect(value).toHaveCSS("color", "rgb(255, 255, 255)");
  await card.hover();
  await expect(value).toHaveCSS("color", "rgb(0, 0, 0)");
});
