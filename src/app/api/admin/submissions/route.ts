import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { formSubmissions } from "@/db/schema";
import {
  adminErrorResponse,
  requireClientAdmin,
} from "@/server/admin-auth";
import { getDb } from "@/server/db";

const updateSchema = z.object({
  id: z.uuid(),
  status: z.enum(["new", "reviewed", "archived"]),
});

export async function GET(request: Request) {
  try {
    await requireClientAdmin(request);
    const rows = await getDb()
      .select()
      .from(formSubmissions)
      .orderBy(desc(formSubmissions.createdAt))
      .limit(250);
    return Response.json({ ok: true, data: rows });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireClientAdmin(request);
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json(
        { ok: false, error: { message: "Invalid submission update." } },
        { status: 422 },
      );
    }
    const [row] = await getDb()
      .update(formSubmissions)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(formSubmissions.id, parsed.data.id))
      .returning();
    return Response.json({ ok: true, data: row });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
