import { expect, test } from "@playwright/test";
test.use({ trace: "off" });
for (const width of [375, 1024, 1440]) test(`coordinator chooses a registration and retries participant changes at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1100 }); let additions = 0, replacements = 0;
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  const row = (id: string, org = "org") => ({ participant: { id, profileId: null, name: `Student ${id}`, email: `${id}@example.test`, status: "approved", attendance: "not_recorded", cancellationRequestedAt: null, updatedAt: "2026-09-03T12:00:00.000Z" }, registration: { id: `reg-${id}`, organisationId: org, status: "approved", changesOpen: true, paymentStatus: "paid", amountDueCents: 12500 }, offering: { id, code: id, startsAt: "2097-10-01T12:00:00Z", timeZone: "America/Jamaica", deliveryMode: "virtual", venue: "", substitutionCutoffAt: null, isCancelled: false }, course: { id, title: `Course ${id}` }, organisationName: "Example organisation" });
  const registrations = [row("one"), row("two"), row("not-coordinated", "other-org")];
  await page.route("**/api/portal", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { ok: true, data: { user: { name: "Example Coordinator", email: "coordinator@example.test" }, memberships: [{ organisationId: "org", role: "coordinator", organisationName: "Example organisation" }, { organisationId: "other-org", role: "participant", organisationName: "Other organisation" }], registrations, materials: [], invoices: [], certificates: [] } } });
    const body = route.request().postDataJSON();
    if (body.action === "add_participant") {
      additions++; expect(body.registrationId).toBe("reg-two");
      if (additions === 1) return route.fulfill({ status: 503, json: { error: { message: "Temporary storage error. Try again." } } });
      return route.fulfill({ json: { ok: true } });
    }
    expect(body).toMatchObject({ action: "replace_participant", participantId: "two", updatedAt: "2026-09-03T12:00:00.000Z", name: "Replacement Student", email: "replacement@example.test" });
    replacements++; registrations[1].participant.name = "Replacement Student"; registrations[1].participant.status = "pending_review";
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/portal"); const roster = page.locator("#organisation");
  await expect(roster.getByLabel("Organisation course registration")).toBeVisible();
  await expect(roster.getByRole("option")).toHaveCount(2);
  await roster.getByLabel("Organisation course registration").selectOption("reg-two");
  const add = roster.locator('form[data-action="add"]');
  await add.getByLabel("Full name", { exact: true }).fill("Additional Student"); await add.getByLabel("Email", { exact: true }).fill("additional@example.test");
  await add.getByRole("button", { name: "Add to roster" }).click(); await expect(roster.getByRole("alert")).toContainText("Temporary storage error");
  await expect(add.getByLabel("Email", { exact: true })).toHaveValue("additional@example.test");
  await add.getByRole("button", { name: "Add to roster" }).click(); await expect(roster.getByRole("status")).toContainText("administrator review");
  await expect(add.getByLabel("Email", { exact: true })).toHaveValue("");
  await roster.getByRole("button", { name: "Replace Student two", exact: true }).click();
  await roster.getByLabel("Replacement full name").fill("Replacement Student"); await roster.getByLabel("Replacement email").fill("replacement@example.test");
  await roster.getByRole("button", { name: "Submit replacement" }).click(); await expect(roster.getByText("Replacement Student", { exact: true })).toBeVisible();
  await expect(roster.getByText("pending review", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await roster.evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Manrope");
  await roster.screenshot({ path: `test-results/coordinator-roster-${width}.png` });
  expect(additions).toBe(2); expect(replacements).toBe(1); expect(errors).toEqual([]);
});
