import { expect, test } from "@playwright/test";
import type { BookingEvent } from "../src/lib/booking-events";

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`booking event editor creates, edits, copies and deletes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    let events: BookingEvent[] = [];
    await page.route("**/api/admin/**", async (route) => {
      if (new URL(route.request().url()).pathname === "/api/admin/images") return route.fulfill({ status: 201, json: { ok: true, data: { url: "/api/images/11111111-1111-4111-8111-111111111111.png" } } });
      if (!route.request().url().includes("booking-events")) return route.fulfill({ json: { ok: true, data: [] } });
      if (route.request().method() === "GET") return route.fulfill({ json: { ok: true, data: events } });
      const input = route.request().postDataJSON();
      let item: BookingEvent;
      if (input.action === "delete") { item = events.find((row) => row.id === input.id)!; events = events.filter((row) => row.id !== input.id); }
      else {
        item = input.action === "duplicate" ? { ...events.find((row) => row.id === input.id)!, id: "copy", data: { ...events.find((row) => row.id === input.id)!.data, title: "Test discovery (copy)", isPublished: false } } : { id: input.id || "fixture-event", data: input.data, updatedAt: new Date().toISOString() };
        events = [item, ...events.filter((row) => row.id !== item.id)];
      }
      return route.fulfill({ json: { ok: true, data: item } });
    });
    await page.goto("/admin/bookings?tab=events");
    await page.getByRole("button", { name: "Add booking event" }).click();
    await page.getByLabel("Event title", { exact: true }).fill("Test discovery");
    await page.getByLabel("Event URL slug").fill("test-discovery");
    await page.getByLabel("Description", { exact: true }).fill("A useful conversation about leadership and delivery.");
    await page.getByLabel("Agent name", { exact: true }).fill("Test Agent");
    await page.getByLabel("Agent photo").setInputFiles({ name: "agent.png", mimeType: "image/png", buffer: Buffer.from("fixture image") });
    await expect(page.getByText("Image uploaded. Save this form to use it.")).toBeVisible();
    await page.getByLabel("Session duration").selectOption("45");
    await page.getByLabel("Publish on the booking page").check();
    await page.getByLabel("Availability horizon unit").selectOption("years");
    await page.getByLabel("Book ahead for", { exact: true }).fill("2");
    await page.getByRole("button", { name: "Add question", exact: true }).click();
    await page.getByLabel("Question 1", { exact: true }).fill("Your priority");
    await page.getByLabel("Required", { exact: true }).check();
    for (const [index, type] of (["textarea", "select", "checkbox"] as const).entries()) {
      await page.getByRole("button", { name: "Add question", exact: true }).click();
      const question = page.locator(".booking-event-question").nth(index + 1);
      await question.getByLabel(`Question ${index + 2}`, { exact: true }).fill(`Fixture ${type}`);
      await question.getByRole("combobox", { name: `Question ${index + 2} type`, exact: true }).selectOption(type);
      if (type === "select") await question.getByLabel("Choices (one per line)").fill("Leadership\nDelivery");
    }
    expect(await page.locator(".booking-event-editor").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.locator(".booking-event-editor").screenshot({ path: `test-results/booking-event-editor-${width}.png` });
    await page.getByRole("button", { name: "Save event", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Test discovery", exact: true })).toBeVisible();
    expect(events[0].data.durationMinutes).toBe(45);
    expect(events[0].data.agentPhoto).toBe("/api/images/11111111-1111-4111-8111-111111111111.png");
    expect(events[0].data.horizon).toEqual({ unit: "years", count: 2 });
    expect(events[0].data.questions[0].label).toBe("Your priority");
    await page.reload();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByLabel("Session duration")).toHaveValue("45");
    await page.getByRole("button", { name: "Remove question 1" }).click();
    await page.getByLabel("Book ahead for", { exact: true }).fill("");
    await page.getByLabel("Availability horizon unit").selectOption("infinite");
    await expect(page.getByLabel("Book ahead for", { exact: true })).toBeDisabled();
    await expect(page.getByLabel("Book ahead for", { exact: true })).toHaveValue("1");
    await page.getByRole("button", { name: "Save event", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Test discovery", exact: true })).toBeVisible();
    expect(events[0].data.questions.map((question) => question.type)).toEqual(["textarea", "select", "checkbox"]);
    expect(events[0].data.horizon).toEqual({ unit: "infinite", count: 1 });
    await page.getByRole("button", { name: "Duplicate", exact: true }).click();
    const copy = page.locator("article").filter({ has: page.getByRole("heading", { name: "Test discovery (copy)", exact: true }) });
    await expect(copy).toContainText("Draft");
    await copy.getByRole("button", { name: "Delete", exact: true }).click();
    await copy.getByRole("button", { name: "Confirm delete", exact: true }).click();
    await expect(copy).toHaveCount(0);
  });
}
