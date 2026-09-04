import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
let database: ReturnType<typeof drizzle>;
vi.mock("@/server/db", () => ({ getDb: () => database }));
vi.mock("@/server/admin-auth", async (original) => {
  const auth = await original<typeof import("@/server/admin-auth")>();
  return { ...auth, requireClientAdmin: async (request: Request) => { if (request.headers.get("x-fixture-admin") !== "yes") throw new auth.AdminAuthError(403, "Administrator required."); return { session: { user: { id: "fixture" } } }; } };
});
import { GET } from "@/app/api/admin/courses/analytics/route";
const enabled = process.env.BOOKING_DB_TESTS === "1"; const fixtureSchema = `course_analytics_test_${randomUUID().replaceAll("-", "")}`;
const courseIds = [randomUUID(), randomUUID(), randomUUID()]; let pool: Pool; let setupPool: Pool;
const request = (extra = "", admin = true) => new Request(`http://localhost:3001/api/admin/courses/analytics?from=2097-01-01&to=2097-02-28${extra}`, { headers: admin ? { "x-fixture-admin": "yes" } : {} });
beforeAll(async () => {
  if (!enabled) return;
  process.loadEnvFile(".env.local"); const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web" || !/^course_analytics_test_[a-f0-9]{32}$/.test(fixtureSchema)) throw new Error("Verified local fixture database required.");
  setupPool = new Pool({ connectionString: url.href }); await setupPool.query(`create schema "${fixtureSchema}"`);
  for (const table of ["courses", "course_offerings", "course_registrations", "registration_participants"]) await setupPool.query(`create table "${fixtureSchema}"."${table}" (like public."${table}" including all)`);
  pool = new Pool({ connectionString: url.href, options: `-c search_path=${fixtureSchema},public` }); database = drizzle(pool);
  const offeringIds: string[] = [];
  for (const [index, id] of courseIds.entries()) {
    await pool.query("insert into courses(id,slug,title,summary,description,status) values($1,$2,$3,'Test','Fixture',$4)", [id, `analytics-${index}`, index === 0 ? "=SUM(1,2)" : `Course ${index}`, index === 1 ? "archived" : "draft"]);
    offeringIds.push((await pool.query("insert into course_offerings(course_id,code,starts_at,ends_at,delivery_mode) values($1,$2,'2098-01-01','2098-01-02','virtual') returning id", [id, `ANALYTICS-${index}`])).rows[0].id);
  }
  const entries = [
    { offering: 0, at: "2097-01-01T04:59:59Z", payment: "paid", statuses: ["approved"] },
    { offering: 0, at: "2097-01-01T05:00:00Z", payment: "paid", statuses: ["approved", "completed"] },
    { offering: 1, at: "2097-01-15T15:00:00Z", payment: "unpaid", statuses: ["waitlisted", "rejected"] },
    { offering: 0, at: "2097-02-01T05:00:00Z", payment: "partially_paid", statuses: ["pending_review", "cancelled", "approved"] },
    { offering: 0, at: "2097-01-20T15:00:00Z", payment: "waived", statuses: [] },
    { offering: 0, at: "2097-03-01T05:00:00Z", payment: "paid", statuses: ["approved"] },
  ];
  for (const [index, entry] of entries.entries()) {
    const registrationId = (await pool.query("insert into course_registrations(offering_id,applicant_name,applicant_email,payment_status,created_at,admin_notes) values($1,'Private applicant','private@example.test',$2,$3,'Private admin information') returning id", [offeringIds[entry.offering], entry.payment, entry.at])).rows[0].id;
    for (const [person, status] of entry.statuses.entries()) await pool.query("insert into registration_participants(registration_id,offering_id,name,email,email_normalized,status,attendance) values($1,$2,'Private person',$3,$3,$4,$5)", [registrationId, offeringIds[entry.offering], `person-${index}-${person}@example.test`, status, status === "completed" ? "attended" : index === 3 && status === "approved" ? "no_show" : "not_recorded"]);
  }
}, 30000);
afterAll(async () => { if (pool) await pool.end(); if (setupPool) { await setupPool.query(`drop schema if exists "${fixtureSchema}" cascade`); await setupPool.end(); } });
it.skipIf(!enabled)("aggregates actual records without group duplication, missing zero months or exposing PII", async () => {
  const response = await GET(request()); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  const { data } = await response.json(); expect(data.totals).toEqual({ applications: 4, participants: 7, courses: 2, approved: 3, completed: 1, pending: 1, waitlisted: 1 });
  expect(data.monthly).toEqual([{ month: "2097-01", applications: 3, participants: 4 }, { month: "2097-02", applications: 1, participants: 3 }]);
  expect(data.payments).toMatchObject({ paid: 1, unpaid: 1, partially_paid: 1, waived: 1 }); expect(data.attendance).toEqual({ attended: 1, not_recorded: 5, partially_attended: 0, no_show: 1 });
  expect(data.courses[0]).toMatchObject({ courseId: courseIds[0], applications: 3, participants: 5, approved: 3 });
  expect(JSON.stringify(data)).not.toMatch(/Private|example\.test|adminNotes|applicant|storageKey/);
  const filtered = (await (await GET(request(`&courseId=${courseIds[1]}`))).json()).data; expect(filtered.totals).toMatchObject({ applications: 1, participants: 2, courses: 1 });
  const empty = (await (await GET(request(`&courseId=${courseIds[2]}`))).json()).data; expect(empty.totals.participants).toBe(0); expect(empty.monthly.every((row: { participants: number }) => row.participants === 0)).toBe(true);
  const csv = await GET(request("&format=csv")); expect(csv.headers.get("content-type")).toContain("text/csv"); expect(csv.headers.get("content-disposition")).toContain("attachment");
  const text = await csv.text(); expect(text).toContain('"Totals","","","","4","7",""'); expect(text).toContain("'=SUM(1,2)"); expect(text).not.toContain("private@example.test");
});
it.skipIf(!enabled)("rejects unauthorized, malformed, duplicate and missing-course requests", async () => {
  expect((await GET(request("", false))).status).toBe(403);
  for (const extra of ["&from=2097-01-01", "&format=exe", "&query=other", "&courseId=invalid", `&courseId=${"x".repeat(1001)}`]) expect((await GET(request(extra))).status).toBe(422);
  expect((await GET(request(`&courseId=${randomUUID()}`))).status).toBe(404);
});
