import { and, eq, gt, lt } from "drizzle-orm";
import { z } from "zod";
import { appointments, bookingBlocks, bookingEvents } from "@/db/schema";
import { buildEventSlots, calendarDateSchema } from "@/lib/booking-events";
import { zonedDateTimeToDate } from "@/lib/booking";
import { getDb } from "@/server/db";
import { occupiedBooking } from "@/server/booking-calendar";

export async function GET(request: Request) {
  const query = z.object({ date: calendarDateSchema, eventId: z.uuid() }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return Response.json({ ok: false, error: "Choose a valid event and date." }, { status: 400 });
  try {
    const db = getDb();
    const [event] = await db.select().from(bookingEvents).where(eq(bookingEvents.id, query.data.eventId)).limit(1);
    if (!event?.data.isPublished) return Response.json({ ok: false, error: "This event is not available for booking." }, { status: 404 });
    const dayStart = zonedDateTimeToDate(query.data.date, "00:00", event.data.timeZone);
    const dayEnd = new Date(dayStart.getTime() + 26 * 3_600_000);
    const [bookings, blocks] = await Promise.all([
      db.select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt }).from(appointments).where(and(occupiedBooking(), lt(appointments.startsAt, dayEnd), gt(appointments.endsAt, dayStart))),
      db.select({ startsAt: bookingBlocks.startsAt, endsAt: bookingBlocks.endsAt }).from(bookingBlocks).where(and(lt(bookingBlocks.startsAt, dayEnd), gt(bookingBlocks.endsAt, dayStart))),
    ]);
    return Response.json({ ok: true, date: query.data.date, timeZone: event.data.timeZone, slots: buildEventSlots(query.data.date, event.data, [...bookings, ...blocks]) });
  } catch {
    return Response.json({ ok: false, error: "Booking availability is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
