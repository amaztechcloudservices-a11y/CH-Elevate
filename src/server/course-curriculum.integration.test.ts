import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { newLesson, newModule } from "@/lib/course-curriculum";
let database: ReturnType<typeof drizzle>;
vi.mock("@/server/db", () => ({ getDb: () => database }));
vi.mock("@/server/auth", () => ({ getAuth: () => ({ api: { getSession: async ({ headers }: { headers: Headers }) => {
  const id = headers.get("x-fixture-user"); return id ? { user: { id, email: "fixture@example.test" } } : null;
} } }) }));
import { GET, POST } from "@/app/api/admin/course-curriculum/route";
import { GET as learning } from "@/app/api/portal/learning/route";
import { GET as download } from "@/app/api/portal/downloads/[kind]/[id]/route";
import { savePrivateFile } from "./course-storage";
const enabled = process.env.BOOKING_DB_TESTS === "1";
const actor = `curriculum-admin-${randomUUID()}`; const student = `curriculum-student-${randomUUID()}`;
const unrelated = `curriculum-unrelated-${randomUUID()}`;
const courseId = randomUUID(); const otherCourseId = randomUUID(); const materialId = randomUUID();
let pool: Pool; let storage = "";
const request = (body?: object, user = actor, origin = "http://localhost:3001") => new Request(`http://localhost:3001/api/admin/course-curriculum?courseId=${courseId}`, { method: body ? "POST" : "GET", headers: { origin, ...(user ? { "x-fixture-user": user } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
const snapshot = async () => (await (await GET(request())).json()).data;
beforeAll(async () => {
  if (!enabled) return;
  process.loadEnvFile(".env.local"); const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55434" || url.pathname !== "/premium_web") throw new Error("Verified local fixture database required.");
  pool = new Pool({ connectionString: process.env.DATABASE_URL }); database = drizzle(pool);
  const base = path.join(process.cwd(), "storage"); await mkdir(base, { recursive: true }); storage = await mkdtemp(path.join(base, "curriculum-test-")); vi.stubEnv("COURSE_STORAGE_DIR", storage);
  for (const [id, role] of [[actor, "client_admin"], [student, "customer"], [unrelated, "customer"]]) await pool.query("insert into profiles(auth_user_id,display_name,role) values($1,'Curriculum Fixture',$2)", [id, role]);
  for (const id of [courseId, otherCourseId]) await pool.query("insert into courses(id,slug,title,summary,description) values($1,$2,'Curriculum Fixture','Temporary curriculum test','Temporary curriculum verification course')", [id, `curriculum-${id}`]);
  const stored = await savePrivateFile(new File(["Private course handout"], "handout.txt", { type: "text/plain" }), "materials");
  await pool.query("insert into course_materials(id,course_id,title,storage_key,original_filename,mime_type,size_bytes) values($1,$2,'Private handout',$3,$4,$5,$6)", [materialId, courseId, stored.storageKey, stored.originalFilename, stored.mimeType, stored.sizeBytes]);
  const offering = (await pool.query("insert into course_offerings(course_id,code,starts_at,ends_at,delivery_mode) values($1,$2,'2097-09-04','2097-09-05','virtual') returning id", [courseId, actor])).rows[0].id;
  const registration = (await pool.query("insert into course_registrations(offering_id,applicant_name,applicant_email) values($1,'Fixture Student','fixture@example.test') returning id", [offering])).rows[0].id;
  await pool.query("insert into registration_participants(registration_id,offering_id,profile_id,name,email,email_normalized,status) select $1,$2,id,'Fixture Student','fixture@example.test','fixture@example.test','approved' from profiles where auth_user_id=$3", [registration, offering, student]);
});
afterAll(async () => {
  if (pool) {
    await pool.query("delete from courses where id=any($1::uuid[])", [[courseId, otherCourseId]]);
    await pool.query("delete from profiles where auth_user_id=any($1::text[])", [[actor, student, unrelated]]);
    await pool.query("delete from audit_logs where actor_auth_user_id=any($1::text[])", [[actor, student, unrelated]]); await pool.end();
  }
  if (storage) {
    const expected = path.join(process.cwd(), "storage", "curriculum-test-");
    if (!path.resolve(storage).startsWith(expected)) throw new Error("Refusing unsafe fixture cleanup.");
    await rm(storage, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});
it.skipIf(!enabled)("saves ordered curriculum atomically and enforces student/file boundaries", async () => {
  expect((await GET(request(undefined, ""))).status).toBe(401);
  expect((await GET(request(undefined, student))).status).toBe(403);
  expect((await learning(request(undefined, ""))).status).toBe(401);
  expect((await learning(request())).status).toBe(403);
  const first = { ...newModule(), title: "Foundations", isPublished: true, lessons: [
    { ...newLesson(), title: "Reading", text: "<script>Never executed</script>\nRead this lesson.", isPublished: true },
    { ...newLesson(), title: "Video", contentType: "video", videoUrl: "https://example.test/video", isPublished: true },
    { ...newLesson(), title: "Handout", contentType: "material", materialId, isPublished: true },
    { ...newLesson(), title: "Hidden draft", text: "Unpublished draft" },
  ] };
  const hidden = { ...newModule(), title: "Draft module", lessons: [{ ...newLesson(), title: "Hidden module lesson", text: "Private draft", isPublished: true }] };
  const input = { courseId, updatedAt: (await snapshot()).course.updatedAt, modules: [first, hidden] };
  expect((await POST(request(input, actor, "https://untrusted.example"))).status).toBe(403);
  expect((await POST(request(input, student))).status).toBe(403);
  expect((await POST(request(input))).status).toBe(200);
  expect((await POST(request(input))).status).toBe(409);
  const stored = await snapshot(); expect(stored.modules.map((section: { title: string }) => section.title)).toEqual(["Foundations", "Draft module"]);
  const reordering = { courseId, updatedAt: stored.course.updatedAt, modules: [hidden, { ...first, lessons: [...first.lessons].reverse() }] };
  expect((await POST(request(reordering))).status).toBe(200);
  expect((await snapshot()).modules[1].lessons[0].title).toBe("Hidden draft");
  const rows = (await (await learning(request(undefined, student))).json()).data;
  expect(rows[0].modules.map((section: { title: string }) => section.title)).toEqual(["Foundations"]);
  expect(rows[0].modules[0].lessons.map((lesson: { title: string }) => lesson.title)).toEqual(["Handout", "Video", "Reading"]);
  expect(JSON.stringify(rows)).not.toContain("storageKey"); expect(JSON.stringify(rows)).not.toContain("Unpublished draft");
  expect((await (await learning(request(undefined, unrelated))).json()).data).toEqual([]);
  const downloadContext = { params: Promise.resolve({ kind: "material", id: materialId }) };
  expect((await download(request(undefined, unrelated), downloadContext)).status).toBe(403);
  const handout = await download(request(undefined, student), downloadContext); expect(handout.status).toBe(200); expect(await handout.text()).toBe("Private course handout");
  await pool.query("update course_materials set is_archived=true where id=$1", [materialId]);
  expect((await download(request(undefined, student), downloadContext)).status).toBe(404);
  expect((await (await learning(request(undefined, student))).json()).data[0].modules[0].lessons).toHaveLength(2);
  expect((await POST(request({ ...reordering, updatedAt: (await snapshot()).course.updatedAt }))).status).toBe(422);
  await pool.query("update course_materials set is_archived=false,course_id=$1 where id=$2", [otherCourseId, materialId]);
  expect((await POST(request({ ...reordering, updatedAt: (await snapshot()).course.updatedAt }))).status).toBe(422);
  const collision = newModule(); await pool.query("insert into course_modules(id,course_id,title,sort_order) values($1,$2,'Other course',0)", [collision.id, otherCourseId]);
  expect((await POST(request({ courseId, updatedAt: (await snapshot()).course.updatedAt, modules: [collision] }))).status).toBe(409);
  expect((await snapshot()).modules).toHaveLength(2);
  await pool.query("update registration_participants set status='pending_review' where offering_id in (select id from course_offerings where course_id=$1)", [courseId]);
  expect((await (await learning(request(undefined, student))).json()).data).toEqual([]);
}, 30000);
