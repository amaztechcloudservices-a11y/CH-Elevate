import { expect, test } from "@playwright/test";
const courseId = "11111111-1111-4111-8111-111111111111"; const otherId = "22222222-2222-4222-8222-222222222222";
test.use({ trace: "off" });
for (const width of [320, 375, 768, 1024, 1440]) {
  test(`participant PDF selection and error recovery at ${width}px`, async ({ page }) => {
    page.setDefaultTimeout(10000); await page.setViewportSize({ width, height: 900 }); let submitted: { participantIds: string[]; courseId: string } | null = null;
    const registrations = Array.from({ length: 51 }, (_, index) => ({ courseId, offeringId: "offering-a", participantId: `participant-${index}`, participantName: `Student ${String(index).padStart(2, "0")}`, participantEmail: `student-${index}@example.test`, participantStatus: index === 0 ? "approved" : "pending_review", attendance: "not_recorded", offeringCode: "OCTOBER", organisationName: "Local organisation", registration: { id: "shared-registration", status: "pending_review", paymentStatus: "unpaid" } }));
    await page.route("**/api/admin/**", async (route) => {
      if (route.request().url().endsWith("/participants/report")) { submitted = route.request().postDataJSON(); return route.fulfill({ status: 409, json: { error: { message: "A selected participant changed. Refresh and try again." } } }); }
      await route.fulfill({ json: { data: { courses: [{ id: courseId, title: "Leadership development" }, { id: otherId, title: "Other course" }], offerings: [], registrations, materials: [], recentActivity: [], metrics: { pending: 0, upcoming: 0, waitlisted: 0, outstandingCents: 0 } } } });
    });
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/admin/courses"); await page.getByRole("button", { name: "Reports", exact: true }).click();
    const panel = page.getByRole("region", { name: "Participant reports" });
    await expect(panel.getByRole("button", { name: "Download selected PDF (0)" })).toBeDisabled();
    await panel.getByRole("combobox", { name: "Report course", exact: true }).selectOption(courseId);
    await expect(panel.getByRole("checkbox")).toHaveCount(50);
    await panel.getByRole("checkbox", { name: "Include Student 00 (student-0@example.test)", exact: true }).check();
    await panel.getByRole("button", { name: "Next participants" }).click();
    await expect(panel.getByRole("checkbox")).toHaveCount(1);
    await panel.getByRole("checkbox").check(); await panel.getByRole("button", { name: "Download selected PDF (2)" }).click();
    await expect(panel.getByRole("alert")).toContainText("Your selection has been retained");
    expect(submitted).toEqual({ courseId, participantIds: ["participant-0", "participant-50"] });
    await panel.getByRole("button", { name: "Select all matching (51)" }).click();
    await expect(panel.getByRole("button", { name: "Download selected PDF (51)" })).toBeEnabled();
    await panel.getByRole("combobox", { name: "Participant status", exact: true }).selectOption("approved");
    await expect(panel.getByRole("checkbox")).toHaveCount(1); await expect(panel.getByRole("checkbox")).not.toBeChecked();
    await panel.getByRole("checkbox").focus(); await page.keyboard.press("Space"); await expect(panel.getByRole("checkbox")).toBeChecked();
    await panel.getByLabel("Find participants").fill("No matching person"); await expect(panel.getByText("No participants match these filters.")).toBeVisible();
    await panel.getByRole("combobox", { name: "Report course", exact: true }).selectOption(otherId); await expect(panel.getByRole("checkbox")).toHaveCount(0);
    await panel.getByRole("combobox", { name: "Report course", exact: true }).selectOption(courseId);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await panel.getByRole("heading").evaluate((element) => getComputedStyle(element).fontFamily)).toContain("Sora");
    await panel.getByLabel("Find participants").fill("Student 00");
    await panel.getByRole("button", { name: "Select all matching (1)" }).hover();
    await expect(panel.getByRole("button", { name: "Select all matching (1)" })).toHaveCSS("color", "rgb(255, 255, 255)");
    // Isolate this component from unrelated fixed page chrome in its visual artifact.
    await panel.screenshot({ path: `test-results/participant-reports-${width}.png`, style: ".ref-header, .cms-admin__topbar { visibility: hidden !important; }" }); expect(errors).toEqual([]);
  });
}
