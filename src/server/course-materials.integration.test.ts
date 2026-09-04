import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { auditLogs } from "@/db/schema";
let database: ReturnType<typeof drizzle>; let failAudit = false;
vi.mock("@/server/db", () => ({ getDb: () => database }));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ api: { getSession: async ({ headers }: { headers: Headers }) => { const id = headers.get("x-fixture-user"); return id ? { user: { id, email: "fixture@example.test" } } : null; } } }) }));
import { POST } from "@/app/api/admin/courses/materials/route";
import { PATCH } from "@/app/api/admin/courses/route";
import { GET as portal } from "@/app/api/portal/route";
import { GET as download } from "@/app/api/portal/downloads/[kind]/[id]/route";
import { readCourseCurriculum } from "./course-curriculum";
const enabled = process.env.BOOKING_DB_TESTS === "1";
const actor = `material-admin-${randomUUID()}`; const student = `material-student-${randomUUID()}`; const other = `material-other-${randomUUID()}`;
const courseId = randomUUID(); const organisationId = randomUUID();
let pool: Pool; let storage = ""; let studentId = ""; let offeringId = "";
const request = (body?: BodyInit, user = actor, origin = "http://localhost:3001") => new Request("http://localhost:3001/api/admin/courses/materials", { method: body ? "POST" : "GET", headers: { origin, ...(user ? { "x-fixture-user": user } : {}) }, ...(body ? { body } : {}) });
function form(title = "Private notes", recipient = studentId, content = "Private material") { const data = new FormData(); data.set("title", title); data.set("courseId", courseId); data.set("offeringId", ""); data.set("recipientProfileId", recipient); data.set("file", new File([content], "notes.txt", { type: "text/plain" })); return data; }
const getFile = (id: string, user = student) => download(request(undefined, user), { params: Promise.resolve({ id, kind: "material" }) });
const archive = (id: string, archived: boolean, user = actor, origin?: string) => PATCH(request(JSON.stringify({ action: "archive_material", id, archived }), user, origin));
beforeAll(async () => {
  if (!enabled) return;
  process.loadEnvFile(".env.local"); const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web") throw new Error("Verified local fixture database required.");
  pool = new Pool({ connectionString: process.env.DATABASE_URL }); const db = drizzle(pool);
  database = new Proxy(db, { get(target, property, receiver) {
    if (property === "transaction") return (callback: Parameters<typeof db.transaction>[0]) => target.transaction((tx) => callback(new Proxy(tx, { get(inner, key, proxy) {
      if (key === "insert") return (table: Parameters<typeof tx.insert>[0]) => { if (table === auditLogs && failAudit) throw new Error("Fixture audit failure"); return inner.insert(table); };
      return Reflect.get(inner, key, proxy);
    } })));
    return Reflect.get(target, property, receiver);
  } });
  const base = path.join(process.cwd(), "storage"); await mkdir(base, { recursive: true }); storage = await mkdtemp(path.join(base, "material-test-")); vi.stubEnv("COURSE_STORAGE_DIR", storage);
  for (const [id, role] of [[actor, "client_admin"], [student, "customer"], [other, "customer"]]) await pool.query("insert into profiles(auth_user_id,display_name,role) values($1,'Material Fixture',$2)", [id, role]);
  studentId = (await pool.query("select id from profiles where auth_user_id=$1", [student])).rows[0].id;
  await pool.query("insert into courses(id,slug,title,summary,description) values($1,$2,'Material fixture','Temporary course','Private test course')", [courseId, `material-${courseId}`]);
  offeringId = (await pool.query("insert into course_offerings(course_id,code,starts_at,ends_at,delivery_mode) values($1,$2,'2097-10-01','2097-10-02','virtual') returning id", [courseId, actor])).rows[0].id;
  await pool.query("insert into organisations(id,name) values($1,'Material fixture organisation')", [organisationId]);
  const registrationId = (await pool.query("insert into course_registrations(offering_id,organisation_id,applicant_name,applicant_email) values($1,$2,'Student','student@example.test') returning id", [offeringId, organisationId])).rows[0].id;
  for (const [id, email] of [[student, "student@example.test"], [other, "other@example.test"]]) await pool.query("insert into registration_participants(registration_id,offering_id,profile_id,name,email,email_normalized,status) select $1,$2,id,'Student',$3,$3,'approved' from profiles where auth_user_id=$4", [registrationId, offeringId, email, id]);
  await pool.query("insert into organisation_memberships(organisation_id,profile_id,role) select $1,id,'coordinator' from profiles where auth_user_id=$2", [organisationId, other]);
});
afterAll(async () => {
  if (pool) { await pool.query("delete from courses where id=$1", [courseId]); await pool.query("delete from organisations where id=$1", [organisationId]); await pool.query("delete from profiles where auth_user_id=any($1::text[])", [[actor, student, other]]); await pool.query("delete from audit_logs where actor_auth_user_id=any($1::text[])", [[actor, student, other]]); await pool.end(); }
  if (storage) { if (!path.resolve(storage).startsWith(path.join(process.cwd(), "storage", "material-test-"))) throw new Error("Unsafe fixture cleanup"); await rm(storage, { recursive: true, force: true }); }
  vi.unstubAllEnvs();
});
it.skipIf(!enabled)("enforces upload boundaries, personal access, versions, archive and approval", async () => {
  expect((await POST(request(form(), ""))).status).toBe(401);
  expect((await POST(request(form(), student))).status).toBe(403);
  expect((await POST(request(form(), actor, "https://untrusted.example"))).status).toBe(403);
  const invalid = form(); invalid.set("offeringId", randomUUID()); expect((await POST(request(invalid))).status).toBe(422);
  const duplicate = form(); duplicate.append("title", "other"); expect((await POST(request(duplicate))).status).toBe(422);
  const first = await POST(request(form())); expect(first.status).toBe(201); const material = (await first.json()).data;
  expect(material).not.toHaveProperty("storageKey");
  expect((await getFile(material.id, "")).status).toBe(401);
  expect((await getFile(material.id, other)).status).toBe(403);
  expect(await (await getFile(material.id)).text()).toBe("Private material");
  await pool.query("update course_materials set course_id=null where id=$1", [material.id]);
  try { expect((await getFile(material.id)).status).toBe(403); }
  finally { await pool.query("update course_materials set course_id=$1 where id=$2", [courseId, material.id]); }
  expect((await getFile("invalid-id")).status).toBe(404);
  expect((await readCourseCurriculum(courseId))?.materials).toEqual([]);
  expect((await (await portal(request(undefined, other))).json()).data.materials).toEqual([]);
  expect((await (await portal(request(undefined, student))).json()).data.materials).toHaveLength(1);
  const shared = await POST(request(form("Private notes", ""))); expect(shared.status).toBe(201);
  expect((await (await portal(request(undefined, other))).json()).data.materials).toHaveLength(1);
  const concurrent = await Promise.all([POST(request(form())), POST(request(form()))]); expect(concurrent.map((r) => r.status)).toEqual([201, 201]);
  const versions = (await pool.query("select id,version,is_archived from course_materials where course_id=$1 and recipient_profile_id=$2 order by version", [courseId, studentId])).rows;
  expect(versions.map((row) => [row.version, row.is_archived])).toEqual([[1, true], [2, true], [3, false]]);
  expect((await getFile(material.id)).status).toBe(404);
  expect((await archive(material.id, false)).status).toBe(409);
  expect((await archive(versions[2].id, true, actor, "https://untrusted.example")).status).toBe(403);
  expect((await archive(versions[2].id, true)).status).toBe(200);
  expect((await archive(material.id, false)).status).toBe(200);
  await pool.query("update registration_participants set status='pending_review' where profile_id=$1", [studentId]);
  expect((await getFile(material.id)).status).toBe(403);
  expect((await (await portal(request(undefined, student))).json()).data.materials).toEqual([]);
  await pool.query("update profiles set active=false where id=$1", [studentId]);
  expect((await POST(request(form()))).status).toBe(422);
  expect((await getFile(material.id)).status).toBe(403);
  await pool.query("update profiles set active=true where id=$1", [studentId]);
});
it.skipIf(!enabled)("rolls back failed metadata and removes only its provisional file", async () => {
  const before = await readdir(path.join(storage, "materials"));
  failAudit = true;
  try { expect((await POST(request(form("Rolled back")))).status).toBe(500); } finally { failAudit = false; }
  expect((await pool.query("select id from course_materials where course_id=$1 and title='Rolled back'", [courseId])).rows).toEqual([]);
  expect(await readdir(path.join(storage, "materials"))).toEqual(before);
});
