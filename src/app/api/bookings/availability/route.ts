import { and, gt, lt, ne } from "drizzle-orm";
import { z } from "zod";

import { appointments, bookingBlocks } from "@/db/schema";
import {
  buildAvailableSlots,
  zonedDateTimeToDate,
} from "@/lib/booking";
import { getCmsSnapshot } from "@/server/cms";
import { getDb } from "@/server/db";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Choose a valid date." },
      { status: 400 },
    );
  }

  const { availability } = await getCmsSnapshot();
  const dayStart = zonedDateTimeToDate(
    parsed.data.date,
    "00:00",
    availability.timeZone,
  );
  const dayEnd = new Date(dayStart.getTime() + 26 * 60 * 60 * 1000);
  let busy: { startsAt: Date; endsAt: Date }[] = [];

  if (process.env.DATABASE_URL) {
    try {
      const database = getDb();
      const [bookings, blocks] = await Promise.all([
        database
          .select({
            startsAt: appointments.startsAt,
            endsAt: appointments.endsAt,
          })
          .from(appointments)
          .where(
            and(
              ne(appointments.status, "cancelled"),
              lt(appointments.startsAt, dayEnd),
              gt(appointments.endsAt, dayStart),
            ),
          ),
        database
          .select({
            startsAt: bookingBlocks.startsAt,
            endsAt: bookingBlocks.endsAt,
          })
          .from(bookingBlocks)
          .where(
            and(
              lt(bookingBlocks.startsAt, dayEnd),
              gt(bookingBlocks.endsAt, dayStart),
            ),
          ),
      ]);
      busy = [...bookings, ...blocks];
    } catch (error) {
      console.error("Booking availability query failed", error);
      return Response.json(
        {
          ok: false,
          error: "Booking availability is temporarily unavailable. Please try again.",
        },
        { status: 503 },
      );
    }
  }

  return Response.json({
    ok: true,
    date: parsed.data.date,
    timeZone: availability.timeZone,
    slots: buildAvailableSlots(parsed.data.date, availability, busy),
  });
}
