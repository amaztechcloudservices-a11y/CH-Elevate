import { asc, sql } from "drizzle-orm";
import { bookingEvents } from "@/db/schema";
import { getDb } from "@/server/db";

export async function GET() {
  try {
    const rows = await getDb().select({ id: bookingEvents.id, data: bookingEvents.data, updatedAt: bookingEvents.updatedAt }).from(bookingEvents)
      .where(sql`${bookingEvents.data}->>'isPublished' = 'true'`).orderBy(asc(bookingEvents.createdAt));
    return Response.json({ ok: true, data: rows });
  } catch {
    return Response.json({ ok: false, error: "Booking events are temporarily unavailable." }, { status: 503 });
  }
}
