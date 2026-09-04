import { expect, test } from "@playwright/test";
import { newBookingEvent, buildEventSlots, type BookingEvent } from "../src/lib/booking-events";
import { type AdminBooking, reservesTime } from "../src/lib/admin-bookings";

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`calendar and request actions work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.setFixedTime(new Date("2026-09-03T12:00:00Z"));
    let event: BookingEvent = { id: "e0415cb6-8f10-4b19-bb09-3c9270e0f641", updatedAt: "2026-09-03T12:00:00Z", data: { ...newBookingEvent, title: "Leadership discovery", slug: "leadership", description: "A leadership planning conversation.", agentName: "Fixture Agent", agentPhoto: "/images/test.jpg", isPublished: true, leadTimeHours: 0 } };
    let bookings: AdminBooking[] = [{ id: "b9ec00df-5942-4914-94b0-c1d62b5fdb43", bookingEventId: event.id, service: event.data.title, customerName: "Test Client", customerEmail: "fixture@example.test", customerPhone: "8765550100", company: "Fixture", startsAt: "2026-09-04T14:00:00Z", endsAt: "2026-09-04T14:30:00Z", timeZone: "America/Jamaica", status: "pending", notes: "", questionnaire: { question_topic: "Leadership", questionLabels: '[{"id":"question_topic","label":"Your priority"}]' }, updatedAt: "2026-09-03T12:00:00Z", deletedAt: null }];
    const mutations: string[] = [];
    await page.route("**/api/admin/**", async (route) => {
      const request = route.request(); const url = new URL(request.url());
      if (url.pathname === "/api/admin/access") return route.fulfill({ json: { ok: true } });
      if (url.pathname === "/api/admin/booking-events") {
        const input = request.postDataJSON(); event = { ...event, data: input.data, updatedAt: new Date().toISOString() };
        return route.fulfill({ json: { ok: true, data: event } });
      }
      if (request.method() === "PATCH") {
        const input = request.postDataJSON(); mutations.push(input.action);
        const row = bookings.find((item) => item.id === input.id)!;
        let result = { ...row, updatedAt: new Date().toISOString() };
        if (input.action === "status") result.status = input.status;
        if (input.action === "edit") result = { ...result, customerName: input.customerName, customerEmail: input.customerEmail, customerPhone: input.customerPhone, company: input.company, notes: input.notes };
        if (input.action === "delete") result.deletedAt = new Date().toISOString();
        if (input.action === "restore") result.deletedAt = null;
        if (input.action === "reschedule" || input.action === "duplicate") {
          const start = new Date(`${input.date}T${input.time}:00-05:00`);
          result = { ...result, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + input.durationMinutes * 60000).toISOString(), status: "pending" };
        }
        if (input.action === "duplicate") { result.id = "copy"; bookings.push(result); }
        else bookings = bookings.map((item) => item.id === input.id ? result : item);
        return route.fulfill({ json: { ok: true, data: result } });
      }
      if (url.pathname.endsWith("/calendar")) {
        const month = url.searchParams.get("month")!;
        const last = new Date(`${month}-01T12:00:00Z`); last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
        const current = bookings.filter((row) => !row.deletedAt && row.startsAt.startsWith(month));
        const busy = current.filter((row) => reservesTime(row.status)).map((row) => ({ startsAt: new Date(row.startsAt), endsAt: new Date(row.endsAt) }));
        const days = Array.from({ length: last.getUTCDate() }, (_, index) => {
          const date = `${month}-${String(index + 1).padStart(2, "0")}`;
          return { date, slots: url.searchParams.has("eventId") ? buildEventSlots(date, event.data, busy, new Date("2026-09-03T12:00:00Z")) : [] };
        });
        return route.fulfill({ json: { ok: true, data: { bookings: current, events: [event], blocks: [], days, timeZone: "America/Jamaica", today: "2026-09-03" } } });
      }
      const deleted = url.searchParams.get("deleted") === "true";
      const filtered = bookings.filter((row) => Boolean(row.deletedAt) === deleted).filter((row) => url.searchParams.get("status") === "all" || row.status === url.searchParams.get("status"));
      return route.fulfill({ json: { ok: true, data: filtered, total: filtered.length, pageSize: 50 } });
    });
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/admin/bookings");
    await expect(page.getByRole("heading", { name: "September 2026", exact: true })).toBeVisible();
    await page.getByLabel("Availability for event").selectOption(event.id);
    await page.getByRole("button", { name: /^Friday, September 4, 2026/ }).click();
    await expect(page.getByRole("heading", { name: "Friday, September 4, 2026", exact: true })).toBeVisible();
    expect(await page.locator(".booking-calendar").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.locator(".booking-calendar-grid").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (width === 320 || width === 1440) await page.locator(".booking-calendar").screenshot({ path: `test-results/booking-calendar-${width}.png` });
    await page.getByRole("button", { name: "Manage booking for Test Client" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible(); await expect(dialog).toContainText("Your priority");
    await expect(dialog.getByRole("button", { name: "Close booking" })).toBeVisible();
    await dialog.getByRole("button", { name: "Approve request" }).click();
    await expect(dialog.getByRole("combobox", { name: "Booking status", exact: true })).toHaveValue("confirmed");
    await dialog.getByRole("button", { name: "Reject request" }).click();
    await expect(dialog.getByRole("combobox", { name: "Booking status", exact: true })).toHaveValue("rejected");
    await dialog.getByRole("button", { name: "Edit details", exact: true }).click();
    await dialog.getByLabel("Admin notes", { exact: true }).fill("Bring a project plan.");
    await dialog.getByRole("button", { name: "Save details" }).click();
    await expect(dialog).toContainText("Bring a project plan.");
    await dialog.getByRole("button", { name: "Reschedule", exact: true }).click();
    await dialog.getByLabel("Date", { exact: true }).fill("2026-09-07");
    await dialog.getByLabel("Time", { exact: true }).fill("10:00");
    await dialog.getByLabel("Duration").selectOption("45");
    await dialog.getByRole("button", { name: "Save new time" }).click();
    await expect(dialog).toContainText("45 minutes");
    await dialog.getByRole("button", { name: "Duplicate", exact: true }).click();
    await dialog.getByLabel("Date", { exact: true }).fill("2026-09-08");
    await dialog.getByLabel("Time", { exact: true }).fill("11:00");
    await dialog.getByRole("button", { name: "Create duplicate booking" }).click();
    await expect(dialog.getByRole("button", { name: "Approve request" })).toBeVisible();
    await dialog.getByRole("button", { name: "Delete booking", exact: true }).click();
    await dialog.getByRole("button", { name: "Keep booking" }).click();
    await dialog.getByRole("button", { name: "Delete booking", exact: true }).click();
    await dialog.getByRole("button", { name: "Confirm move to Deleted bookings" }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole("button", { name: "Deleted bookings", exact: true }).click();
    await page.getByRole("button", { name: "Manage booking for Test Client" }).click();
    await page.getByRole("button", { name: "Restore booking", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "All requests", exact: true }).click();
    await expect(page.getByRole("button", { name: "Manage booking for Test Client" })).toHaveCount(2);
    await page.getByRole("button", { name: "Calendar", exact: true }).click();
    await page.getByRole("button", { name: /^Friday, September 4, 2026/ }).click();
    await page.getByText("Edit availability for this date", { exact: true }).click();
    await page.getByRole("button", { name: "Remove time window 1" }).click();
    await page.getByRole("button", { name: "Close this date" }).click();
    await expect(page.getByRole("button", { name: /^Friday, September 4, 2026/ })).toHaveAccessibleName(/0 available times/);
    expect(event.data.dateOverrides).toEqual([{ date: "2026-09-04", windows: [] }]);
    expect(mutations).toEqual(["status", "status", "edit", "reschedule", "duplicate", "delete", "restore"]);
    expect(errors).toEqual([]);
  });
}
