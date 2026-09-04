import { expect, request as playwrightRequest, test } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";

test.use({ trace: "off", screenshot: "off", actionTimeout: 10000 });
let cleanup: (() => Promise<void>) | undefined;
test.afterEach(async () => { await cleanup?.(); cleanup = undefined; });
test("one administrator login switches between isolated workspaces without changing content", async ({ browser }) => {
  test.skip(process.env.BOOKING_DB_TESTS !== "1", "Explicit local fixture run required.");
  test.setTimeout(120000);
  const baseURL = process.env.COURSE_E2E_BASE_URL || "http://localhost:3001"; const url = new URL(process.env.DATABASE_URL!);
  if (baseURL !== "http://localhost:3001" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web") throw new Error("Verified local fixture targets required.");
  const pool = new Pool({ connectionString: url.href }); const email = `workspace-review-${randomUUID()}@example.test`; const password = randomBytes(24).toString("hex"); let userId = "";
  const api = await playwrightRequest.newContext({ baseURL }); const ui = await browser.newContext({ baseURL });
  cleanup = async () => { await ui.close().catch(() => {}); await api.dispose().catch(() => {}); try { await pool.query("delete from profiles where auth_user_id=$1", [userId]); await pool.query('delete from "user" where id=$1 and email=$2', [userId, email]); } finally { await pool.end(); } };
  const endpoints = ["cms", "courses", "booking-events"];
  for (const endpoint of endpoints) expect((await api.get(`/api/admin/${endpoint}`)).status()).toBe(401);
  expect((await api.patch("/api/admin/cms", { data: {} })).status()).toBe(401);
  const signup = await api.post("/api/auth/sign-up/email", { data: { name: "Workspace review administrator", email, password } }); expect(signup.status()).toBe(200); userId = (await signup.json()).user.id;
  for (const endpoint of endpoints) expect((await api.get(`/api/admin/${endpoint}`)).status()).toBe(403);
  expect((await api.patch("/api/admin/cms", { data: {} })).status()).toBe(403);
  await pool.query("update profiles set role='client_admin' where auth_user_id=$1", [userId]);
  const page = await ui.newPage();
  const calls: string[] = []; const writes: string[] = [];
  page.on("request", (request) => { const path = new URL(request.url()).pathname; if (path.startsWith("/api/admin/")) { calls.push(path); if (request.method() !== "GET") writes.push(path); } });
  for (const [workspace, heading] of [["bookings", "Booking"], ["courses", "Course"], ["website", "Website"]]) {
    await page.goto(`/admin/login?next=${encodeURIComponent(`/admin/${workspace}`)}`);
    await expect(page.getByRole("heading", { name: `${heading} administration sign in.`, exact: true })).toBeVisible();
  }
  await page.goto("/admin/login?next=%2Fadmin%2Fbookings");
  await page.getByLabel("Email address").fill(email); await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in to booking administration", exact: true }).click();
  await expect(page.locator("main.cms-admin")).toHaveAttribute("data-workspace", "bookings");
  for (const [workspace, label, allowed] of [
    ["courses", "Course Registration", ["/api/admin/access", "/api/admin/courses"]],
    ["website", "Website Management", ["/api/admin/cms", "/api/admin/submissions"]],
    ["bookings", "Booking administration", ["/api/admin/access", "/api/admin/bookings/calendar"]],
  ] as const) {
    calls.length = 0;
    await page.getByRole("navigation", { name: "Switch administration workspace" }).getByRole("link", { name: label, exact: true }).click();
    await page.waitForURL(`**/admin/${workspace}`); await page.waitForLoadState("networkidle");
    await expect(page.locator("main.cms-admin")).toHaveAttribute("data-workspace", workspace);
    expect(calls.length).toBeGreaterThan(0); expect(calls.every((path) => (allowed as readonly string[]).includes(path))).toBe(true);
  }
  expect(writes).toEqual([]);
  const cms = await ui.request.get("/api/admin/cms"); expect(cms.status()).toBe(200);
  const data = (await cms.json()).data; expect(Object.keys(data).sort()).toEqual(["forms", "heroSlides", "pages", "settings"]);
  expect(data.forms.some((form: { key: string }) => form.key === "booking")).toBe(false);
  expect((await ui.request.patch("/api/admin/cms", { headers: { origin: baseURL }, data: { ...data, availability: {} } })).status()).toBe(422);
  expect((await ui.request.patch("/api/admin/cms", { headers: { origin: "https://untrusted.example" }, data })).status()).toBe(403);
  await pool.query("update profiles set active=false where auth_user_id=$1", [userId]);
  for (const endpoint of endpoints) expect((await ui.request.get(`/api/admin/${endpoint}`)).status()).toBe(403);
  expect((await ui.request.patch("/api/admin/cms", { data: {} })).status()).toBe(403);
});
