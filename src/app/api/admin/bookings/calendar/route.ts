import { and, asc, gt, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { appointments, bookingBlocks, bookingEvents } from "@/db/schema";
import { buildEventSlots, dateInZone } from "@/lib/booking-events";
import { reservesTime } from "@/lib/admin-bookings";
import { zonedDateTimeToDate } from "@/lib/booking";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { getDb } from "@/server/db";

const querySchema = z.object({ month: z.string().regex(/^(?:[2-9]\d{3})-(?:0[1-9]|1[0-2])$/).refine((value) => Number(value.slice(0, 4)) <= 9998), eventId: z.uuid().optional() });
export async function GET(request: Request) {
  try {
    await requireClientAdmin(request);
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return Response.json({ ok: false, error: { message: "Choose a valid calendar month." } }, { status: 422 });
    const db = getDb();
    const events = await db.select().from(bookingEvents).orderBy(asc(bookingEvents.createdAt));
    const event = events.find((item) => item.id === parsed.data.eventId);
    if (parsed.data.eventId && !event) return Response.json({ ok: false, error: { message: "Booking event not found." } }, { status: 404 });
    const timeZone = event?.data.timeZone || "America/Jamaica";
    const first = `${parsed.data.month}-01`;
    const next = new Date(`${first}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
    const start = zonedDateTimeToDate(first, "00:00", timeZone);
    const end = zonedDateTimeToDate(next.toISOString().slice(0, 10), "00:00", timeZone);
    // Bounded by a calendar month, not an arbitrary booking-count cutoff.
    const [rows, blocks] = await Promise.all([
      db.select().from(appointments).where(and(isNull(appointments.deletedAt), lt(appointments.startsAt, end), gt(appointments.endsAt, start))).orderBy(asc(appointments.startsAt), asc(appointments.id)),
      db.select().from(bookingBlocks).where(and(lt(bookingBlocks.startsAt, end), gt(bookingBlocks.endsAt, start))).orderBy(asc(bookingBlocks.startsAt)),
    ]);
    const days: { date: string; slots: ReturnType<typeof buildEventSlots> }[] = [];
    const busy = [...rows.filter((row) => reservesTime(row.status)), ...blocks];
    const now = new Date();
    for (const day = new Date(`${first}T12:00:00Z`); day < next; day.setUTCDate(day.getUTCDate() + 1)) {
      const date = day.toISOString().slice(0, 10);
      days.push({ date, slots: event ? buildEventSlots(date, event.data, busy, now) : [] });
    }
    return Response.json({ ok: true, data: { bookings: rows, blocks, events, days, timeZone, today: dateInZone(now, timeZone) } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
