import { and, eq, gt, lt, sql } from "drizzle-orm";
import { appointments, bookingBlocks, bookingEvents } from "@/db/schema";
import { bookingEventRequestSchema, buildEventSlots, validateEventAnswers } from "@/lib/booking-events";
import { zonedDateTimeToDate } from "@/lib/booking";
import { getDb } from "@/server/db";
import { occupiedBooking } from "@/server/booking-calendar";
import { dispatchBookingMail, enqueueBookingMail } from "@/server/booking-mail";
import { PublicRateLimitError, consumePublicSubmissionLimits } from "@/server/public-rate-limit";
import { JsonBodyError, readBoundedJson } from "@/server/request-body";

const BOOKING_BODY_LIMIT = 64 * 1024;
const BOOKING_RATE_WINDOW = 15 * 60 * 1000;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await readBoundedJson(request, BOOKING_BODY_LIMIT);
  } catch (error) {
    if (error instanceof JsonBodyError) return Response.json({ ok: false, error: error.code === "too_large" ? "The booking request is too large." : "The booking request must contain valid JSON." }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    return Response.json({ ok: false, error: "Your booking could not be submitted. Please try again." }, { status: 503 });
  }
  const parsed = bookingEventRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ ok: false, error: "Please review the booking details.", issues: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) }, { status: 400 });
  const input = parsed.data;
  try {
    await consumePublicSubmissionLimits([
      { scope: "booking_global", key: "all", limit: 300, windowMs: BOOKING_RATE_WINDOW },
      { scope: "booking_identity", key: `${input.eventId}:${input.email.toLowerCase()}`, limit: 20, windowMs: BOOKING_RATE_WINDOW },
    ]);
    const result = await getDb().transaction(async (tx) => {
      // Every request uses the same consultant calendar, including across event types.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ch-elevate-booking-calendar'))`);
      const [event] = await tx.select().from(bookingEvents).where(eq(bookingEvents.id, input.eventId)).for("share");
      if (!event?.data.isPublished) return { error: "This event is not available for booking.", status: 404 } as const;
      const answers = validateEventAnswers(event.data, input.answers);
      if (!answers.success) return { error: "Please complete the event questionnaire with valid answers.", status: 400 } as const;
      const startsAt = zonedDateTimeToDate(input.date, input.time, event.data.timeZone);
      const endsAt = new Date(startsAt.getTime() + event.data.durationMinutes * 60_000);
      const [bookings, blocks] = await Promise.all([
        tx.select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt }).from(appointments).where(and(occupiedBooking(), lt(appointments.startsAt, endsAt), gt(appointments.endsAt, startsAt))),
        tx.select({ startsAt: bookingBlocks.startsAt, endsAt: bookingBlocks.endsAt }).from(bookingBlocks).where(and(lt(bookingBlocks.startsAt, endsAt), gt(bookingBlocks.endsAt, startsAt))),
      ]);
      if (!buildEventSlots(input.date, event.data, [...bookings, ...blocks]).some((slot) => slot.value === input.time)) return { error: "That time is no longer available. Please choose another time.", status: 409 } as const;
      const [booking] = await tx.insert(appointments).values({
        bookingEventId: event.id, customerName: input.name, customerEmail: input.email, customerPhone: input.phone,
        company: input.company || null, service: event.data.title, startsAt, endsAt, timeZone: event.data.timeZone,
        questionnaire: { ...input.answers, consent: true, agentName: event.data.agentName, questionLabels: JSON.stringify(event.data.questions.map(({ id, label }) => ({ id, label }))) },
      }).returning();
      const deliveryIds = await enqueueBookingMail(tx, booking, ["received", "adminNew"]);
      return { booking: { id: booking.id, status: booking.status, startsAt: booking.startsAt }, deliveryIds };
    });
    if ("error" in result) return Response.json({ ok: false, error: result.error }, { status: result.status });
    await dispatchBookingMail(result.deliveryIds);
    return Response.json({ ok: true, booking: result.booking }, { status: 201 });
  } catch (error) {
    if (error instanceof PublicRateLimitError) return Response.json({ ok: false, error: "Too many booking requests. Please wait before trying again." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(error.retryAfterSeconds) } });
    return Response.json({ ok: false, error: "Your booking could not be submitted. Please try again." }, { status: 503 });
  }
}
