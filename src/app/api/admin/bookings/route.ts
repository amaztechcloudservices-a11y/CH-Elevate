import { and, count, desc, eq, gt, ilike, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { appointments, auditLogs, bookingBlocks } from "@/db/schema";
import { bookingMutationSchema, bookingStatuses, reservesTime, scheduledInterval } from "@/lib/admin-bookings";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { occupiedBooking } from "@/server/booking-calendar";
import { getDb } from "@/server/db";
import { dispatchBookingMail, enqueueBookingMail } from "@/server/booking-mail";
import type { BookingMailKind } from "@/lib/booking-mail";

const failure = (message: string, status: number) => Response.json({ ok: false, error: { message } }, { status });
const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  status: z.enum(["all", ...bookingStatuses]).default("all"),
  deleted: z.enum(["true", "false"]).default("false"),
  search: z.string().trim().max(120).default(""),
});
export async function GET(request: Request) {
  try {
    await requireClientAdmin(request);
    const parsed = listSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return failure("Invalid booking filters.", 422);
    const { page, status, deleted, search } = parsed.data;
    const escaped = search.replace(/[\\%_]/g, "\\$&");
    const where = and(deleted === "true" ? isNotNull(appointments.deletedAt) : isNull(appointments.deletedAt),
      status === "all" ? undefined : eq(appointments.status, status),
      search ? or(ilike(appointments.customerName, `%${escaped}%`), ilike(appointments.customerEmail, `%${escaped}%`), ilike(appointments.service, `%${escaped}%`)) : undefined);
    const pageSize = 50;
    const db = getDb();
    const [rows, [total]] = await Promise.all([
      db.select().from(appointments).where(where).orderBy(desc(appointments.startsAt), desc(appointments.id)).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ value: count() }).from(appointments).where(where),
    ]);
    return Response.json({ ok: true, data: rows, page, pageSize, total: total.value }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
export async function PATCH(request: Request) {
  try {
    const { session } = await requireClientAdmin(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) return failure("A same-origin request is required.", 403);
    const parsed = bookingMutationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return failure("Review the booking details and try again.", 422);
    const input = parsed.data;
    const outcome = await getDb().transaction(async (tx) => {
      // Same lock as public requests, including operations that free or restore a slot.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ch-elevate-booking-calendar'))`);
      const [existing] = await tx.select().from(appointments).where(eq(appointments.id, input.id)).for("update");
      if (!existing) return failure("Booking not found.", 404);
      if (existing.updatedAt.toISOString() !== input.updatedAt) return failure("This booking changed in another window. Refresh before making changes.", 409);
      if (input.action === "restore" ? !existing.deletedAt : existing.deletedAt) return failure("This booking is not available for that action. Refresh the list.", 409);
      const update: Partial<typeof appointments.$inferInsert> = { updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)) };
      if (input.action === "status") update.status = input.status;
      if (input.action === "edit") {
        update.customerName = input.customerName; update.customerEmail = input.customerEmail;
        update.customerPhone = input.customerPhone || null; update.company = input.company || null; update.notes = input.notes || null;
      }
      if (input.action === "delete") update.deletedAt = new Date();
      if (input.action === "restore") update.deletedAt = null;
      if (input.action === "reschedule" || input.action === "duplicate") {
        const interval = scheduledInterval(input.date, input.time, input.durationMinutes, existing.timeZone);
        if (!interval) return failure("Choose a valid future date and time in the booking time zone.", 422);
        Object.assign(update, interval);
        update.status = "pending";
      }
      const next = { ...existing, ...update };
      const changesReservation = ["reschedule", "duplicate", "restore", "status"].includes(input.action);
      if (changesReservation && reservesTime(next.status!, next.deletedAt)) {
        const [conflicts, blocks] = await Promise.all([
          tx.select({ id: appointments.id }).from(appointments).where(and(occupiedBooking(), input.action === "duplicate" ? undefined : ne(appointments.id, existing.id), lt(appointments.startsAt, next.endsAt!), gt(appointments.endsAt, next.startsAt!))).limit(1),
          tx.select({ id: bookingBlocks.id }).from(bookingBlocks).where(and(lt(bookingBlocks.startsAt, next.endsAt!), gt(bookingBlocks.endsAt, next.startsAt!))).limit(1),
        ]);
        if (conflicts.length || blocks.length) return failure("That time overlaps another booking or a calendar block. Choose another time.", 409);
      }
      let result;
      if (input.action === "duplicate") {
        const { id: _id, createdAt: _created, updatedAt: _updated, ...copy } = existing;
        void _id; void _created; void _updated;
        [result] = await tx.insert(appointments).values({ ...copy, ...update, deletedAt: null }).returning();
      } else {
        [result] = await tx.update(appointments).set(update).where(eq(appointments.id, existing.id)).returning();
      }
      await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: `booking.appointment_${input.action}`, entityType: "appointment", entityId: result.id,
        metadata: { previousStatus: existing.status, status: result.status, ...(input.action === "duplicate" ? { sourceId: existing.id } : {}) } });
      const statusKind: Record<typeof result.status, BookingMailKind> = { pending: "received", confirmed: "approved", rejected: "rejected", cancelled: "cancelled", completed: "completed", no_show: "noShow" };
      const kind = input.action === "reschedule" ? "rescheduled" : input.action === "duplicate" ? "received" : input.action === "status" ? statusKind[result.status] : null;
      const deliveryIds = input.notifyCustomer && kind ? await enqueueBookingMail(tx, result, [kind]) : [];
      return { data: result, deliveryIds };
    });
    if (outcome instanceof Response) return outcome;
    const notifications = await dispatchBookingMail(outcome.deliveryIds);
    return Response.json({ ok: true, data: outcome.data, notifications }, { status: input.action === "duplicate" ? 201 : 200 });
  } catch (error) { return adminErrorResponse(error); }
}
