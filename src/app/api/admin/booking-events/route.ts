import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { appointments, auditLogs, bookingEvents } from "@/db/schema";
import { bookingEventSchema } from "@/lib/booking-events";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { getDb } from "@/server/db";

const failure = (message: string, status: number) => Response.json({ ok: false, error: { message } }, { status });
const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), data: bookingEventSchema }),
  z.object({ action: z.literal("update"), id: z.uuid(), updatedAt: z.iso.datetime(), data: bookingEventSchema }),
  z.object({ action: z.literal("duplicate"), id: z.uuid() }),
  z.object({ action: z.literal("delete"), id: z.uuid() }),
]);
export async function GET(request: Request) {
  try {
    await requireClientAdmin(request);
    return Response.json({ ok: true, data: await getDb().select().from(bookingEvents).orderBy(desc(bookingEvents.createdAt)) });
  } catch (error) { return adminErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const { session } = await requireClientAdmin(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) return failure("A same-origin request is required.", 403);
    const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return failure(parsed.error.issues[0]?.message || "Invalid event.", 422);
    const input = parsed.data;
    return await getDb().transaction(async (tx) => {
      let result;
      if (input.action === "create") {
        [result] = await tx.insert(bookingEvents).values({ slug: input.data.slug, data: input.data }).returning();
      } else {
        const [existing] = await tx.select().from(bookingEvents).where(eq(bookingEvents.id, input.id)).for("update");
        if (!existing) return failure("Booking event not found.", 404);
        if (input.action === "delete") {
          const [linked] = await tx.select({ id: appointments.id }).from(appointments).where(eq(appointments.bookingEventId, input.id)).limit(1);
          if (linked) return failure("This event has booking records. Unpublish it to stop new requests while keeping its history.", 409);
          await tx.delete(bookingEvents).where(eq(bookingEvents.id, input.id));
          result = existing;
        } else if (input.action === "duplicate") {
          const data = { ...existing.data, title: `${existing.data.title.slice(0, 150)} (copy)`, slug: `${existing.slug.slice(0, 120)}-${randomUUID().slice(0, 8)}`, isPublished: false };
          [result] = await tx.insert(bookingEvents).values({ slug: data.slug, data }).returning();
        } else {
          if (existing.updatedAt.toISOString() !== input.updatedAt) return failure("This event changed in another window. Reload before saving.", 409);
          [result] = await tx.update(bookingEvents).set({ slug: input.data.slug, data: input.data, updatedAt: new Date() }).where(eq(bookingEvents.id, input.id)).returning();
        }
      }
      await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: `booking.event_${input.action}`, entityType: "booking_event", entityId: result.id });
      return Response.json({ ok: true, data: result }, { status: input.action === "create" || input.action === "duplicate" ? 201 : 200 });
    });
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } })?.cause?.code || (error as { code?: string })?.code;
    if (code === "23505") return failure("That event URL is already in use. Choose a different slug.", 409);
    if (code === "23503") return failure("This event has booking records and cannot be deleted.", 409);
    return adminErrorResponse(error);
  }
}
