import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auditLogs, profiles, studentPosts, user } from "@/db/schema";
import { studentPostMutation } from "@/lib/student-posts";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { getDb } from "@/server/db";
const fail = (message: string, status: number) => Response.json({ ok: false, error: { message } }, { status });
export async function GET(request: Request) {
  try {
    await requireClientAdmin(request);
    const parsed = z.uuid().safeParse(new URL(request.url).searchParams.get("profileId"));
    if (!parsed.success) return fail("Select a student.", 422);
    const db = getDb();
    const [student] = await db.select({ id: profiles.id, name: profiles.displayName, email: user.email }).from(profiles).innerJoin(user, eq(user.id, profiles.authUserId)).where(and(eq(profiles.id, parsed.data), eq(profiles.role, "customer"), eq(profiles.active, true)));
    if (!student) return fail("Active student account not found.", 404);
    const posts = await db.select({ id: studentPosts.id, title: studentPosts.title, body: studentPosts.body, isPublished: studentPosts.isPublished, createdAt: studentPosts.createdAt, updatedAt: studentPosts.updatedAt }).from(studentPosts).where(eq(studentPosts.profileId, student.id)).orderBy(desc(studentPosts.createdAt), desc(studentPosts.id));
    return Response.json({ ok: true, data: { student, posts } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const { session } = await requireClientAdmin(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) return fail("A same-origin request is required.", 403);
    const parsed = studentPostMutation.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Review the post.", 422);
    const input = parsed.data;
    return await getDb().transaction(async (tx) => {
      const [student] = await tx.select({ id: profiles.id }).from(profiles).where(and(eq(profiles.id, input.profileId), eq(profiles.role, "customer"), eq(profiles.active, true))).for("share");
      if (!student) return fail("Active student account not found.", 404);
      let postId: string;
      if (input.action === "create") {
        const [post] = await tx.insert(studentPosts).values({ ...input.data, profileId: student.id }).returning({ id: studentPosts.id });
        postId = post.id;
      } else {
        const [existing] = await tx.select().from(studentPosts).where(and(eq(studentPosts.id, input.id), eq(studentPosts.profileId, student.id))).for("update");
        if (!existing) return fail("Post not found for this student.", 404);
        if (existing.updatedAt.toISOString() !== input.updatedAt) return fail("This post changed in another window. Reload before trying again.", 409);
        if (input.action === "delete") await tx.delete(studentPosts).where(eq(studentPosts.id, existing.id));
        else await tx.update(studentPosts).set({ ...input.data, updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)) }).where(eq(studentPosts.id, existing.id));
        postId = existing.id;
      }
      await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: `course.student_post_${input.action}`, entityType: "student_post", entityId: postId, metadata: { profileId: student.id } });
      return Response.json({ ok: true }, { status: input.action === "create" ? 201 : 200 });
    });
  } catch (error) { return adminErrorResponse(error); }
}
