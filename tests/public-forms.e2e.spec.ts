import { expect, test } from "@playwright/test";

import { defaultCmsSnapshot } from "../src/lib/cms";

test("contact enquiry changes preserve the visitor's draft", async ({ page }) => {
  await page.goto("/contact");
  const name = page.locator("input[name=name]");
  await name.scrollIntoViewIfNeeded();
  await name.fill("Assessment Client");
  await page.locator("input[name=email]").fill("client@example.test");
  await page.getByRole("button", { name: "PMO Consultancy", exact: true }).click();
  await expect(name).toHaveValue("Assessment Client");
  await expect(page.locator("input[name=email]")).toHaveValue("client@example.test");
  await expect(page.getByLabel("Subject")).toHaveValue("PMO Consultancy");
});

test("public forms use website-managed presentation and active state", async ({ page }) => {
  const snapshot = structuredClone(defaultCmsSnapshot);
  const contact = snapshot.forms.find((form) => form.key === "contact")!;
  contact.submitLabel = "Send managed enquiry";
  contact.successMessage = "Managed contact success";
  contact.fields.find((field) => field.name === "name")!.label = "Managed full name";
  contact.fields.find((field) => field.name === "name")!.placeholder = "Managed name placeholder";
  const newsletter = snapshot.forms.find((form) => form.key === "newsletter")!;
  newsletter.isActive = false;

  await page.route("**/api/site-content", (route) => route.fulfill({ json: { ok: true, data: snapshot } }));
  await page.goto("/contact");
  await page.locator("input[name=name]").scrollIntoViewIfNeeded();
  await expect(page.getByLabel("Managed full name")).toHaveAttribute("placeholder", "Managed name placeholder");
  await expect(page.getByRole("button", { name: "Send managed enquiry" })).toBeVisible();
  await expect(page.locator(".ref-newsletter")).toHaveCount(0);
});
