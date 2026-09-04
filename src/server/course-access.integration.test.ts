import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { emptyCourse, type CourseCatalogueInput } from "@/lib/course-catalogue";

let database: ReturnType<typeof drizzle>;
vi.mock("@/server/db", () => ({ getDb: () => database }));
vi.mock("@/server/course-mail", () => ({ sendCourseMail: vi.fn(async () => ({ delivered: true })) }));
vi.mock("@/server/site-mail", () => ({ sendPrimaryInboxMail: vi.fn(async () => ({ delivered: true })) }));
vi.mock("@/server/admin-auth", async (original) => {
  const auth = await original<typeof import("@/server/admin-auth")>();
  return { ...auth, requireClientAdmin: async (request: Request) => {
    if (request.headers.get("x-fixture-admin") !== "yes") throw new auth.AdminAuthError(403, "Administrator required.");
    return { session: { user: { id: "course-access-fixture" } } };
  } };
});
import { GET, POST } from "@/app/api/admin/course-catalogue/route";
import { GET as catalogue } from "@/app/api/course-catalogue/route";
import { GET as offerings, POST as register } from "@/app/api/courses/route";

const enabled = process.env.BOOKING_DB_TESTS === "1";
const fixtureSchema = `course_access_test_${randomUUID().replaceAll("-", "")}`;
let pool: Pool; let setupPool: Pool;
const instructorId = randomUUID(); const categoryId = randomUUID();
const request = (body?: object, admin = true, origin = "http://localhost:3001") => new Request("http://localhost:3001/api/admin/course-catalogue", {
  method: body ? "POST" : "GET", headers: { origin, ...(admin ? { "x-fixture-admin": "yes" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
});
const input = (): CourseCatalogueInput => ({ ...emptyCourse, title: "Access fixture", slug: randomUUID(), summary: "Local access verification.", description: "A local fixture, not a real course.", subtitle: "Offline access", bannerUrl: "/images/home-hero-background-4.png", instructorId, categoryId, status: "published" });
beforeAll(async () => {
  if (!enabled) return;
  process.loadEnvFile(".env.local"); const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web" || !/^course_access_test_[a-f0-9]{32}$/.test(fixtureSchema)) throw new Error("Verified local fixture database required.");
  setupPool = new Pool({ connectionString: url.href }); await setupPool.query(`create schema "${fixtureSchema}"`);
  for (const table of ["courses", "course_categories", "profiles", "user", "audit_logs", "course_offerings", "course_registrations", "registration_participants", "organisations", "course_materials", "course_modules"]) await setupPool.query(`create table "${fixtureSchema}"."${table}" (like public."${table}" including all)`);
  pool = new Pool({ connectionString: url.href, options: `-c search_path=${fixtureSchema},public` }); database = drizzle(pool);
  await pool.query("insert into profiles(id,auth_user_id,display_name,role) values($1,'access-fixture','Access instructor','staff')", [instructorId]);
  await pool.query("insert into course_categories(id,name) values($1,'Access category')", [categoryId]);
});
afterAll(async () => { if (pool) await pool.end(); if (setupPool) { await setupPool.query(`drop schema if exists "${fixtureSchema}" cascade`); await setupPool.end(); } });

it.skipIf(!enabled)("persists all access types and currencies with exact cents, copies metadata and hides private courses", async () => {
  for (const accessType of ["free", "one_time", "subscription", "private"] as const) for (const currency of ["JMD", "USD", "GBP", "EUR", "CAD"] as const) {
    const data = { ...input(), accessType, currency, priceCents: accessType === "free" ? 0 : 12545, subscription: "Monthly access; contact administration for offline arrangements." };
    const created = await POST(request({ action: "create", data })); expect(created.status).toBe(201);
    const saved = (await created.json()).data;
    const expected = { accessType, currency, priceCents: data.priceCents, subscription: data.subscription };
    expect(saved).toMatchObject(expected);
    expect((await (await GET(request())).json()).data.find((row: { id: string }) => row.id === saved.id)).toMatchObject(expected);
    expect((await pool.query("select access_type,currency,price_cents,subscription from courses where id=$1", [saved.id])).rows[0]).toEqual({ access_type: accessType, currency, price_cents: data.priceCents, subscription: data.subscription });
    const publicCard = (await (await catalogue()).json()).data.find((row: { id: string }) => row.id === saved.id);
    if (accessType === "private") expect(publicCard).toBeUndefined(); else expect(publicCard).toMatchObject({ ...expected, subscription: accessType === "subscription" ? data.subscription : "" });
    const copied = await POST(request({ action: "duplicate", id: saved.id, updatedAt: saved.updatedAt })); expect(copied.status).toBe(201);
    expect((await copied.json()).data).toMatchObject({ ...expected, status: "draft", isActive: false });
    const changed = await POST(request({ action: "update", id: saved.id, updatedAt: saved.updatedAt, data: { ...data, priceCents: accessType === "free" ? 0 : 1 } })); expect(changed.status).toBe(200);
    expect((await pool.query("select price_cents from courses where id=$1", [saved.id])).rows[0].price_cents).toBe(accessType === "free" ? 0 : 1);
  }
});

it.skipIf(!enabled)("rejects invalid access, money and gateway data without writing, and enforces administrator origin", async () => {
  const data = { ...input(), accessType: "one_time", priceCents: 12545 };
  const before = (await pool.query("select count(*)::int as count from courses")).rows[0].count;
  for (const changes of [{ accessType: "purchase" }, { currency: "XXX" }, { priceCents: -1 }, { priceCents: 1.5 }, { priceCents: 100000001 }, { priceCents: null }, { priceCents: "12545" }, { priceCents: undefined }, { currency: undefined }, { accessType: "free" }, { accessType: "subscription", subscription: "   " }, { subscription: "x".repeat(301) }, { paymentGateway: "stripe" }, { checkout: true }, { autoCharge: true }]) {
    expect((await POST(request({ action: "create", data: { ...data, ...changes } }))).status).toBe(422);
  }
  expect((await POST(request({ action: "create", data }, false))).status).toBe(403);
  expect((await POST(request({ action: "create", data }, true, "https://untrusted.example"))).status).toBe(403);
  expect((await pool.query("select count(*)::int as count from courses")).rows[0].count).toBe(before);
});

it.skipIf(!enabled)("keeps offering fees authoritative and approvals manual, and rejects direct private registration", async () => {
  for (const accessType of ["free", "one_time", "subscription", "private"] as const) {
    const data = { ...input(), accessType, priceCents: accessType === "free" ? 0 : 99000, currency: "EUR" as const, subscription: "Monthly terms arranged offline" };
    const created = await POST(request({ action: "create", data })); expect(created.status).toBe(201);
    const saved = (await created.json()).data;
    const offeringId = (await pool.query("insert into course_offerings(course_id,code,starts_at,ends_at,delivery_mode,is_published,fee_cents,currency) values($1,$2,'2097-09-04','2097-09-05','virtual',true,12345,'USD') returning id", [saved.id, randomUUID()])).rows[0].id;
    const publicOffering = (await (await offerings()).json()).data.find((row: { id: string }) => row.id === offeringId);
    if (accessType === "private") expect(publicOffering).toBeUndefined(); else expect(publicOffering).toMatchObject({ feeCents: 12345, currency: "USD" });
    const application = { offeringId, applicantName: "Access applicant", applicantEmail: "access@example.test", consent: true, participants: [{ name: "Student one", email: "one@example.test" }, { name: "Student two", email: "two@example.test" }] };
    const response = await register(new Request("http://localhost:3001/api/courses", { method: "POST", body: JSON.stringify(application) }));
    expect(response.status).toBe(accessType === "private" ? 409 : 201);
    if (accessType === "private") {
      expect((await pool.query("select id from course_registrations where offering_id=$1", [offeringId])).rows).toHaveLength(0);
      continue;
    }
    const registration = (await pool.query("select id,amount_due_cents,payment_status,status from course_registrations where offering_id=$1", [offeringId])).rows[0];
    expect(registration).toMatchObject({ amount_due_cents: 24690, payment_status: "unpaid", status: "pending_review" });
    expect((await pool.query("select status from registration_participants where offering_id=$1", [offeringId])).rows).toEqual([{ status: "pending_review" }, { status: "pending_review" }]);
    const changed = await POST(request({ action: "update", id: saved.id, updatedAt: saved.updatedAt, data: { ...data, accessType: "private", priceCents: 99999, currency: "GBP" } })); expect(changed.status).toBe(200);
    expect((await pool.query("select id,amount_due_cents,payment_status,status from course_registrations where offering_id=$1", [offeringId])).rows[0]).toEqual(registration);
    expect((await pool.query("select fee_cents,currency from course_offerings where id=$1", [offeringId])).rows[0]).toEqual({ fee_cents: 12345, currency: "USD" });
    expect((await (await offerings()).json()).data.some((row: { id: string }) => row.id === offeringId)).toBe(false);
  }
});
