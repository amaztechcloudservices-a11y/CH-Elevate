import { and, asc, count, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { profiles, user } from "@/db/schema";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { getDb } from "@/server/db";
export async function GET(request: Request) {
  try {
    await requireClientAdmin(request);
    const params = new URL(request.url).searchParams;
    const parsed = z.object({ search: z.string().trim().max(120), page: z.coerce.number().int().min(1).max(100000) }).safeParse({ search: params.get("search") || "", page: params.get("page") || 1 });
    if (!parsed.success) return Response.json({ ok: false, error: { message: "Invalid student search." } }, { status: 422 });
    const { search, page } = parsed.data; const db = getDb();
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    const filter = and(eq(profiles.role, "customer"), eq(profiles.active, true), search ? or(ilike(profiles.displayName, pattern), ilike(user.email, pattern)) : undefined);
    const students = await db.select({ id: profiles.id, name: profiles.displayName, email: user.email }).from(profiles).innerJoin(user, eq(user.id, profiles.authUserId)).where(filter).orderBy(asc(profiles.displayName), asc(profiles.id)).limit(25).offset((page - 1) * 25);
    const [total] = await db.select({ count: count() }).from(profiles).innerJoin(user, eq(user.id, profiles.authUserId)).where(filter);
    return Response.json({ ok: true, data: students, total: total.count, page, pageSize: 25 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
