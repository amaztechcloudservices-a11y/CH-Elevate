import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { newBookingEvent } from "@/lib/booking-events";
let database: ReturnType<typeof drizzle>;
vi.mock("@/server/db", () => ({ getDb: () => database }));
vi.mock("@/server/booking-mail", () => ({ enqueueBookingMail: vi.fn(async () => []), dispatchBookingMail: vi.fn(async () => []) }));
vi.mock("@/server/admin-auth", async (original) => {
  const auth = await original<typeof import("@/server/admin-auth")>();
  return { ...auth, requireClientAdmin: async () => ({ session: { user: { id: "questionnaire-fixture" } } }) };
});
import { POST as mutate, GET as listAdmin } from "@/app/api/admin/booking-events/route";
import { GET as listPublic } from "@/app/api/bookings/events/route";
import { GET as availability } from "@/app/api/bookings/availability/route";
import { POST as book } from "@/app/api/bookings/route";
const enabled = process.env.BOOKING_DB_TESTS === "1"; const schema = `booking_questionnaire_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool; let setup: Pool;
const adminRequest = (data?: object) => new Request("http://localhost:3001/api/admin/booking-events", { method: data ? "POST" : "GET", headers: { origin: "http://localhost:3001" }, ...(data ? { body: JSON.stringify(data) } : {}) });
const submit = (data: object) => book(new Request("http://localhost:3001/api/bookings", { method: "POST", body: JSON.stringify(data) }));
const fixture = async () => {
  const data = { ...newBookingEvent, slug: `questionnaire-${randomUUID()}`, title: "Questionnaire fixture", subtitle: "A focused discussion", description: "Discuss the next priorities for your organisation.", agentName: "Fixture Agent", agentPhoto: "/images/home-hero-background-4.png", isPublished: true, leadTimeHours: 0, horizon: { unit: "infinite", count: 1 }, weekly: newBookingEvent.weekly.map((day) => ({ ...day, enabled: true })) };
  const response = await mutate(adminRequest({ action: "create", data })); expect(response.status).toBe(201); return (await response.json()).data;
};
beforeAll(async () => {
  if (!enabled) return; process.loadEnvFile(".env.local"); const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web") throw new Error("Verified local fixture database required.");
  setup = new Pool({ connectionString: url.href }); await setup.query(`create schema "${schema}"`);
  for (const table of ["booking_events", "appointments", "booking_blocks", "audit_logs"]) await setup.query(`create table "${schema}"."${table}" (like public."${table}" including all)`);
  pool = new Pool({ connectionString: url.href, options: `-c search_path=${schema},public` }); database = drizzle(pool);
});
afterAll(async () => { if (pool) await pool.end(); if (setup) { await setup.query(`drop schema "${schema}" cascade`); await setup.end(); } });

it.skipIf(!enabled)("validates every question type against the saved event and preserves historic question labels", async () => {
  const event = await fixture();
  const questions = [
    { id: "question_short", label: "Goals", type: "text", required: true, options: [] },
    { id: "question_long", label: "Context", type: "textarea", required: false, options: [] },
    { id: "question_choice", label: "Preferred topic", type: "select", required: true, options: ["Leadership", "Delivery"] },
    { id: "question_check", label: "Confirm contact", type: "checkbox", required: true, options: [] },
  ];
  const changed = await mutate(adminRequest({ action: "update", id: event.id, updatedAt: event.updatedAt, data: { ...event.data, questions } })); expect(changed.status).toBe(200); const saved = (await changed.json()).data;
  const input = { eventId: event.id, date: "2093-09-04", time: "09:00", name: "Fixture client", email: "fixture@example.test", phone: "8765550100", consent: true };
  const valid = { question_short: "Delivery systems", question_long: "Team context", question_choice: "Leadership", question_check: true };
  for (const answers of [{}, { ...valid, question_short: "   " }, { ...valid, question_short: true }, { ...valid, question_long: "x".repeat(3001) }, { ...valid, question_choice: "Injected choice" }, { ...valid, question_check: false }, { ...valid, question_check: "true" }, { ...valid, question_other: "unknown" }]) expect((await submit({ ...input, answers })).status).toBe(400);
  expect((await pool.query("select count(*)::int as count from appointments")).rows[0].count).toBe(0);
  expect((await submit({ ...input, answers: valid })).status).toBe(201);
  const appointment = (await pool.query("select * from appointments where booking_event_id=$1", [event.id])).rows[0];
  expect(appointment.questionnaire).toMatchObject(valid); expect(appointment.status).toBe("pending");
  expect(JSON.parse(appointment.questionnaire.questionLabels)).toEqual(questions.map(({ id, label }) => ({ id, label })));
  expect((await mutate(adminRequest({ action: "update", id: saved.id, updatedAt: saved.updatedAt, data: { ...saved.data, questions: questions.slice(1) } }))).status).toBe(200);
  expect((await submit({ ...input, time: "10:00", answers: valid })).status).toBe(400);
  const { question_short: removed, ...current } = valid; expect(removed).toBe("Delivery systems");
  expect((await submit({ ...input, time: "10:00", answers: current })).status).toBe(201);
  expect((await pool.query("select questionnaire from appointments where id=$1", [appointment.id])).rows[0].questionnaire).toEqual(appointment.questionnaire);
});

it.skipIf(!enabled)("admin edits persist all question types and the two-step browser booking recovers and stores answers", async () => {
  const { chromium, expect: browserExpect } = await import("@playwright/test");
  const event = await fixture(); const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const client = await browser.newPage({ viewport: { width: 375, height: 900 } });
  let attempts = 0;
  try {
    await page.route("**/api/admin/**", async (route) => {
      const incoming = route.request();
      if (new URL(incoming.url()).pathname !== "/api/admin/booking-events") return route.fulfill({ json: { ok: true, data: [] } });
      const response = incoming.method() === "POST" ? await mutate(adminRequest(incoming.postDataJSON())) : await listAdmin(adminRequest());
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });
    await page.goto("http://localhost:3001/admin/bookings?tab=events");
    const card = page.locator("article").filter({ has: page.locator(`a[href="/book?event=${event.data.slug}"]`) });
    await card.getByRole("button", { name: "Edit", exact: true }).click();
    for (const [index, [label, type, required]] of ([ ["Goals", "text", true], ["Context", "textarea", false], ["Preferred topic", "select", true], ["Confirm contact", "checkbox", true], ["Remove me", "text", false] ] as const).entries()) {
      await page.getByRole("button", { name: "Add question", exact: true }).click();
      const question = page.locator(".booking-event-question").nth(index);
      await question.getByLabel(`Question ${index + 1}`, { exact: true }).fill(label);
      await question.getByRole("combobox", { name: `Question ${index + 1} type`, exact: true }).selectOption(type);
      if (required) await question.getByLabel("Required", { exact: true }).check();
      if (type === "select") await question.getByLabel("Choices (one per line)").fill("Leadership\nDelivery");
    }
    await page.getByRole("button", { name: "Save event", exact: true }).click(); await browserExpect(card).toBeVisible();
    await page.reload(); await card.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("button", { name: "Remove question 5", exact: true }).click();
    await page.getByLabel("Question 1", { exact: true }).fill("Your goals");
    await page.getByRole("button", { name: "Save event", exact: true }).click(); await browserExpect(card).toBeVisible();
    const saved = (await pool.query("select data from booking_events where id=$1", [event.id])).rows[0].data;
    expect(saved.questions.map((question: { type: string }) => question.type)).toEqual(["text", "textarea", "select", "checkbox"]);
    expect(saved.questions[0].label).toBe("Your goals");
    await client.clock.setFixedTime(new Date("2093-09-04T12:00:00Z"));
    await client.route("**/api/bookings**", async (route) => {
      const incoming = route.request(); const path = new URL(incoming.url()).pathname;
      if (path === "/api/bookings" && ++attempts === 1) return route.abort("failed");
      const response = path === "/api/bookings/events" ? await listPublic() : path === "/api/bookings/availability" ? await availability(new Request(incoming.url())) : await submit(incoming.postDataJSON());
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });
    await client.goto(`http://localhost:3001/book?event=${event.data.slug}`);
    const form = client.locator(".booking-two-step");
    await browserExpect(form.getByRole("heading", { name: event.data.title, exact: true })).toBeVisible();
    await browserExpect(form.getByText(event.data.subtitle, { exact: true })).toBeVisible(); await browserExpect(form.getByText(event.data.description, { exact: true })).toBeVisible();
    await browserExpect(form.getByAltText("Fixture Agent")).toBeVisible();
    await browserExpect(form.getByLabel("Full name", { exact: true })).toBeHidden();
    await form.getByRole("button", { name: "Next month", exact: true }).click(); await browserExpect(form.getByRole("heading", { name: "October 2093" })).toBeVisible();
    await form.getByRole("button", { name: "Previous month", exact: true }).click();
    await form.getByRole("button", { name: "2093-09-05", exact: true }).click(); await form.getByRole("button", { name: "9:00 am", exact: true }).click();
    await form.getByRole("button", { name: "Continue to your details" }).click();
    await browserExpect(form.getByLabel("Full name", { exact: true })).toBeFocused();
    await form.getByLabel("Full name", { exact: true }).fill("Browser fixture client"); await form.getByLabel("Email", { exact: true }).fill("browser-client@example.test"); await form.getByLabel("Phone", { exact: true }).fill("8765550100");
    await form.getByRole("button", { name: "Request booking", exact: true }).click(); expect(attempts).toBe(0);
    await form.getByLabel("Your goals *", { exact: true }).fill("Improve delivery"); await form.getByLabel("Context", { exact: true }).fill("A growing team");
    await form.getByRole("combobox", { name: "Preferred topic *", exact: true }).selectOption("Delivery"); await form.getByLabel("Confirm contact", { exact: true }).check(); await form.getByLabel(/I consent to CH Elevate/).check();
    await browserExpect(form.getByLabel("Remove me")).toHaveCount(0);
    expect(await form.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await form.getByRole("button", { name: "Request booking", exact: true }).click(); await browserExpect(form.locator(".form-note")).toContainText(/fetch|submitted/i);
    await browserExpect(form.getByLabel("Your goals *", { exact: true })).toHaveValue("Improve delivery");
    const answers = Object.fromEntries(saved.questions.map((question: { id: string }, index: number) => [question.id, ["Improve delivery", "A growing team", "Delivery", true][index]]));
    expect((await submit({ eventId: event.id, date: "2093-09-05", time: "09:00", name: "Competing fixture", email: "competing@example.test", phone: "8765550100", consent: true, answers })).status).toBe(201);
    await form.getByRole("button", { name: "Request booking", exact: true }).click(); await browserExpect(form.getByRole("button", { name: "Continue to your details" })).toBeDisabled();
    await browserExpect(form.locator(".form-note")).toContainText("no longer available");
    await form.getByRole("button", { name: "2093-09-05", exact: true }).click(); await form.getByRole("button", { name: "9:30 am", exact: true }).click();
    await browserExpect(form.getByRole("button", { name: "9:00 am", exact: true })).toHaveCount(0);
    await form.getByRole("button", { name: "Continue to your details" }).click(); await browserExpect(form.getByLabel("Your goals *", { exact: true })).toHaveValue("Improve delivery");
    await form.getByRole("button", { name: "Request booking", exact: true }).click(); await browserExpect(client).toHaveURL(/\/book\/confirmation$/);
    await browserExpect(client.getByRole("heading", { name: "Your consultation request is received." })).toBeVisible(); expect(attempts).toBe(3);
    const rows = (await pool.query("select * from appointments where booking_event_id=$1 and customer_email=$2", [event.id, "browser-client@example.test"])).rows;
    expect(rows).toHaveLength(1); expect(rows[0].questionnaire).toMatchObject(answers); expect(rows[0].starts_at.toISOString()).toBe("2093-09-05T14:30:00.000Z");
  } finally { await browser.close(); }
}, 90000);
