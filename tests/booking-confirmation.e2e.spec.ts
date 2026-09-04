import { expect, test } from "@playwright/test";
import { newBookingEvent } from "../src/lib/booking-events";

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`two-step event booking confirms at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.setFixedTime(new Date("2026-09-03T12:00:00Z"));
    const eventId = "11111111-1111-4111-8111-111111111111";
    const data = { ...newBookingEvent, title: "Leadership discovery", slug: "leadership-discovery", subtitle: "A focused conversation", description: "Discuss your next leadership priority with our team.", agentName: "Test Agent", agentPhoto: "/images/home-hero-background-4.png", isPublished: true, questions: [
      { id: "question_topic", label: "Discussion topic", type: "text", required: true, options: [] },
      { id: "question_context", label: "Additional context", type: "textarea", required: false, options: [] },
      { id: "question_priority", label: "Priority", type: "select", required: true, options: ["Leadership", "Delivery"] },
      { id: "question_contact", label: "Contact agreement", type: "checkbox", required: true, options: [] },
    ] };
    await page.route("**/api/bookings/events", (route) => route.fulfill({ json: { ok: true, data: [{ id: eventId, data, updatedAt: new Date().toISOString() }] } }));
    let availabilityRequests = 0;
    await page.route("**/api/bookings/availability?*", (route) => {
      availabilityRequests++;
      expect(new URL(route.request().url()).searchParams.get("eventId")).toBe(eventId);
      return route.fulfill({ json: { ok: true, slots: [{ value: "14:00", label: "2:00 pm", startsAt: "2026-09-14T19:00:00Z" }] } });
    });
    await page.route("**/api/bookings", (route) => {
      const body = route.request().postDataJSON();
      expect(body.eventId).toBe(eventId);
      expect(body.answers).toEqual({ question_topic: "Improve team delivery", question_context: "A growing team", question_priority: "Delivery", question_contact: true });
      expect(body.consent).toBe(true);
      return route.fulfill({ status: 201, json: { ok: true, booking: { id: "fixture-booking", status: "pending" } } });
    });
    await page.goto("/book?event=leadership-discovery");
    await expect(page.getByRole("heading", { name: "Leadership discovery", exact: true })).toBeVisible();
    await expect(page.getByAltText("Test Agent")).toBeVisible();
    await expect(page.getByLabel("Full name", { exact: true })).not.toBeVisible();
    await page.getByRole("button", { name: "Next month", exact: true }).click();
    await expect(page.getByRole("heading", { name: "October 2026" })).toBeVisible();
    await page.getByRole("button", { name: "Previous month", exact: true }).click();
    await page.getByRole("button", { name: "2026-09-14", exact: true }).click();
    await expect(page.getByRole("button", { name: "2026-09-14", exact: true })).toHaveCSS("background-color", "rgb(0, 87, 81)");
    await page.getByRole("button", { name: "2:00 pm", exact: true }).click();
    await page.locator(".booking-two-step").screenshot({ path: `test-results/booking-calendar-${width}.png` });
    expect(await page.locator(".booking-two-step").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.locator(".booking-event-summary > p").evaluate((element) => element.getBoundingClientRect().width / element.parentElement!.getBoundingClientRect().width)).toBeGreaterThan(.9);
    await page.getByRole("button", { name: "Continue to your details" }).click();
    await expect(page.getByLabel("Full name", { exact: true })).toBeFocused();
    await page.getByLabel("Full name", { exact: true }).fill("Confirmation Test");
    await page.getByLabel("Email", { exact: true }).fill("fixture@example.test");
    await page.getByLabel("Phone", { exact: true }).fill("8765550102");
    await page.getByLabel("Discussion topic").fill("Improve team delivery");
    await page.getByLabel("Additional context").fill("A growing team");
    await page.getByRole("combobox", { name: "Priority *", exact: true }).selectOption("Delivery");
    await page.getByLabel("Contact agreement", { exact: true }).check();
    await expect(page.getByLabel("Contact agreement", { exact: true })).toHaveCSS("width", "18px");
    await expect(page.getByLabel("Contact agreement", { exact: true })).toHaveCSS("height", "18px");
    expect(await page.getByLabel("Contact agreement", { exact: true }).evaluate((element) => element.closest("label")!.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await page.getByLabel(/I consent to CH Elevate/).check();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "2026-09-14", exact: true }).click();
    await page.getByRole("button", { name: "2:00 pm", exact: true }).click();
    expect(availabilityRequests).toBe(2);
    await page.getByRole("button", { name: "Continue to your details" }).click();
    await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Confirmation Test");
    await page.locator(".booking-two-step").screenshot({ path: `test-results/booking-questionnaire-${width}.png`, style: ".ref-header, nextjs-portal { visibility: hidden !important; }" });
    await page.getByRole("button", { name: "Request booking", exact: true }).click();
    await expect(page).toHaveURL(/\/book\/confirmation$/);
    await expect(page.getByRole("heading", { name: "Your consultation request is received." })).toBeVisible();
  });
}
