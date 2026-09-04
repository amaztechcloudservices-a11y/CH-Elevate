import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { auditLogs, formSubmissions } from "@/db/schema";
import {
  adminErrorResponse,
  requireClientAdmin,
} from "@/server/admin-auth";
import { getDb } from "@/server/db";

const updateSchema = z.object({
  id: z.uuid(),
  status: z.enum(["new", "reviewed", "archived"]),
  updatedAt: z.iso.datetime(),
}).strict();
const fail = (message: string, status: number) => Response.json({ ok: false, error: { message } }, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request) {
  try {
    await requireClientAdmin(request);
    const rows = await getDb()
      .select()
      .from(formSubmissions)
      .where(ne(formSubmissions.formKey, "booking"))
      .orderBy(desc(formSubmissions.createdAt))
      .limit(250);
    return Response.json({ ok: true, data: rows }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { session } = await requireClientAdmin(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) return fail("A same-origin request is required.", 403);
    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return Response.json(
        { ok: false, error: { message: "Invalid submission update." } },
        { status: 422 },
      );
    }
    const result = await getDb().transaction(async (tx) => {
      const [before] = await tx.select().from(formSubmissions).where(and(eq(formSubmissions.id, parsed.data.id), ne(formSubmissions.formKey, "booking"))).for("update");
      if (!before) return { error: "Website submission not found.", status: 404 };
      if (before.updatedAt.toISOString() !== parsed.data.updatedAt) return { error: "This submission changed. Refresh the inbox before reviewing it again.", status: 409 };
      if (before.status === parsed.data.status) return { row: before };
      const [row] = await tx.update(formSubmissions).set({ status: parsed.data.status, updatedAt: new Date(Math.max(Date.now(), before.updatedAt.getTime() + 1)) }).where(eq(formSubmissions.id, before.id)).returning();
      await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "website.submission_status_updated", entityType: "form_submission", entityId: before.id, metadata: { previousStatus: before.status, status: row.status } });
      return { row };
    });
    if ("error" in result) return fail(result.error!, result.status!);
    return Response.json({ ok: true, data: result.row }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
