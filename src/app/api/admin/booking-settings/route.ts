import { eq } from "drizzle-orm";
import { auditLogs, cmsDocuments } from "@/db/schema";
import { availabilitySchema, defaultCmsSnapshot } from "@/lib/cms";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { getDb } from "@/server/db";

export async function GET(request: Request) {
  try {
    await requireClientAdmin(request);
    const [row] = await getDb().select({ data: cmsDocuments.data }).from(cmsDocuments).where(eq(cmsDocuments.key, "availability")).limit(1);
    return Response.json({ ok: true, data: availabilitySchema.parse(row?.data ?? defaultCmsSnapshot.availability) });
  } catch (error) { return adminErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const { session } = await requireClientAdmin(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ ok: false, error: { message: "A same-origin request is required." } }, { status: 403 });
    const parsed = availabilitySchema.strict().safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ ok: false, error: { message: "Review the booking settings." } }, { status: 422 });
    const updatedAt = new Date();
    await getDb().transaction(async (tx) => {
      const values = { documentType: "availability", data: parsed.data, updatedByAuthUserId: session.user.id, updatedAt };
      await tx.insert(cmsDocuments).values({ key: "availability", ...values }).onConflictDoUpdate({ target: cmsDocuments.key, set: values });
      await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "booking.settings_updated", entityType: "booking_settings", entityId: "availability" });
    });
    return Response.json({ ok: true, data: parsed.data });
  } catch (error) { return adminErrorResponse(error); }
}
