import { expect, request as playwrightRequest, test } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { bookingHorizonEnd, newBookingEvent } from "../src/lib/booking-events";
test.use({ trace: "off", screenshot: "off", actionTimeout: 10000 });
let cleanup: (() => Promise<void>) | undefined;
// Hooks have their own timeout budget, so a failed browser action cannot strand fixtures.
test.afterEach(async () => { await cleanup?.(); cleanup = undefined; });
test("admin saves every availability horizon and the public calendar honors it", async ({ browser }) => {
  test.skip(process.env.BOOKING_DB_TESTS !== "1", "Explicit local fixture run required."); test.setTimeout(120000);
  const baseURL = process.env.COURSE_E2E_BASE_URL || "http://localhost:3001"; const dbUrl = new URL(process.env.DATABASE_URL!);
  if (new URL(baseURL).origin !== "http://localhost:3001" || !["localhost", "127.0.0.1"].includes(dbUrl.hostname) || dbUrl.port !== "55434" || dbUrl.pathname !== "/premium_web") throw new Error("Verified local server/database required.");
  const suffix = randomUUID(); const slug = `horizon-live-${suffix}`; let userId = ""; let eventId = "";
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const api = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } });
  const windows: Awaited<ReturnType<typeof browser.newContext>>[] = [];
  cleanup = async () => {
    for (const window of windows) await window.close().catch(() => {}); await api.dispose().catch(() => {});
    try {
      await pool.query("delete from audit_logs where actor_auth_user_id=$1 and entity_id=$2", [userId, eventId]);
      await pool.query("delete from booking_events where slug=$1", [slug]); await pool.query("delete from profiles where auth_user_id=$1", [userId]); await pool.query('delete from "user" where id=$1', [userId]);
    } finally { await pool.end(); }
  };
    const signup = await api.post("/api/auth/sign-up/email", { data: { name: "Horizon fixture admin", email: `horizon-live-${suffix}@example.test`, password: randomBytes(24).toString("hex") } }); expect(signup.status()).toBe(200); userId = (await signup.json()).user.id;
    expect((await api.get("/api/admin/booking-events")).status()).toBe(403); await pool.query("update profiles set role='client_admin' where auth_user_id=$1", [userId]);
    const data = { ...newBookingEvent, title: `Horizon review ${suffix}`, slug, description: "Temporary event for local horizon verification.", agentName: "Fixture Agent", agentPhoto: "/images/home-hero-background-4.png", isPublished: true, leadTimeHours: 0, weekly: newBookingEvent.weekly.map((day) => ({ ...day, enabled: true, windows: [{ start: "23:00", end: "23:59" }] })) };
    const created = await api.post("/api/admin/booking-events", { data: { action: "create", data } }); expect(created.status()).toBe(201); eventId = (await created.json()).data.id;
    const admin = await browser.newContext({ baseURL, storageState: await api.storageState() }); windows.push(admin); const page = await admin.newPage();
    const guest = await browser.newContext({ baseURL }); windows.push(guest); const publicPage = await guest.newPage();
    await page.goto("/admin/bookings?tab=events");
    for (const unit of ["days", "weeks", "months", "years", "infinite"] as const) {
      await test.step(`Save and verify ${unit} horizon`, async () => {
      const card = page.locator("article").filter({ has: page.getByRole("heading", { name: data.title, exact: true }) });
      await card.getByRole("button", { name: "Edit", exact: true }).click();
      if (unit === "infinite") await page.getByLabel("Book ahead for", { exact: true }).fill("");
      await page.getByRole("combobox", { name: "Availability horizon unit", exact: true }).selectOption(unit);
      if (unit !== "infinite") await page.getByLabel("Book ahead for", { exact: true }).fill("2");
      else { await expect(page.getByLabel("Book ahead for", { exact: true })).toBeDisabled(); await expect(page.getByLabel("Book ahead for", { exact: true })).toHaveValue("1"); }
      await page.getByRole("button", { name: "Save event", exact: true }).click(); await expect(card).toBeVisible(); await page.reload(); await expect(card).toBeVisible();
      const saved = (await pool.query("select data from booking_events where id=$1", [eventId])).rows[0].data;
      expect(saved.horizon).toEqual({ unit, count: unit === "infinite" ? 1 : 2 });
      const end = bookingHorizonEnd(saved) || "2099-01-01";
      const available = await api.get(`/api/bookings/availability?eventId=${eventId}&date=${end}`); expect(available.status()).toBe(200); expect((await available.json()).slots.length).toBeGreaterThan(0);
      if (unit !== "infinite") {
        const next = new Date(`${end}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1); const beyond = next.toISOString().slice(0, 10);
        expect((await (await api.get(`/api/bookings/availability?eventId=${eventId}&date=${beyond}`)).json()).slots).toEqual([]);
      }
      await publicPage.goto(`/book?event=${slug}`); await expect(publicPage.getByRole("heading", { name: data.title, exact: true })).toBeVisible();
      if (unit === "days" || unit === "months") {
        const endDate = publicPage.getByRole("button", { name: end, exact: true });
        for (let months = 0; months < 3 && await endDate.count() === 0; months++) await publicPage.getByRole("button", { name: "Next month", exact: true }).click();
        await expect(endDate).toBeEnabled(); await expect(publicPage.getByRole("button", { name: "Next month", exact: true })).toBeDisabled();
        await endDate.click(); await expect(publicPage.getByRole("button", { name: "11:00 pm", exact: true })).toBeVisible();
      }
      if (unit === "infinite") { for (let months = 0; months < 3; months++) await publicPage.getByRole("button", { name: "Next month", exact: true }).click(); await expect(publicPage.getByRole("button", { name: "Next month", exact: true })).toBeEnabled(); }
      });
    }
});
