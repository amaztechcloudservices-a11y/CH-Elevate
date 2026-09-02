import { and, gt, lt, ne } from "drizzle-orm";

import { appointments, bookingBlocks, formSubmissions } from "@/db/schema";
import {
  bookingRequestSchema,
  buildAvailableSlots,
  zonedDateTimeToDate,
} from "@/lib/booking";
import { getCmsSnapshot } from "@/server/cms";
import { getDb } from "@/server/db";
import { sendPrimaryInboxMail, sendWebsiteMail } from "@/server/site-mail";

export async function POST(request: Request) {
  const parsed = bookingRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: "Please review the booking details.",
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return Response.json(
      { ok: false, error: "Booking storage is not configured yet." },
      { status: 503 },
    );
  }

  const { availability } = await getCmsSnapshot();
  const startsAt = zonedDateTimeToDate(
    parsed.data.date,
    parsed.data.time,
    availability.timeZone,
  );
  const endsAt = new Date(
    startsAt.getTime() + availability.slotMinutes * 60 * 1000,
  );
  const database = getDb();

  const booking = await database.transaction(async (transaction) => {
    const [appointmentConflicts, blockedConflicts] = await Promise.all([
      transaction
        .select({
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
        })
        .from(appointments)
        .where(
          and(
            ne(appointments.status, "cancelled"),
            lt(appointments.startsAt, endsAt),
            gt(appointments.endsAt, startsAt),
          ),
        ),
      transaction
        .select({
          startsAt: bookingBlocks.startsAt,
          endsAt: bookingBlocks.endsAt,
        })
        .from(bookingBlocks)
        .where(
          and(
            lt(bookingBlocks.startsAt, endsAt),
            gt(bookingBlocks.endsAt, startsAt),
          ),
        ),
    ]);

    const available = buildAvailableSlots(
      parsed.data.date,
      availability,
      [...appointmentConflicts, ...blockedConflicts],
    ).some((slot) => slot.value === parsed.data.time);

    if (!available) return null;

    const payload = {
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      company: parsed.data.company,
      service: parsed.data.service,
      date: parsed.data.date,
      time: parsed.data.time,
      priority: parsed.data.priority,
      timeline: parsed.data.timeline,
      consent: parsed.data.consent,
    };

    const [created] = await transaction
      .insert(appointments)
      .values({
        customerName: parsed.data.name,
        customerEmail: parsed.data.email,
        customerPhone: parsed.data.phone,
        company: parsed.data.company || null,
        service: parsed.data.service,
        startsAt,
        endsAt,
        timeZone: availability.timeZone,
        questionnaire: {
          priority: parsed.data.priority,
          timeline: parsed.data.timeline,
          consent: parsed.data.consent,
        },
      })
      .returning({
        id: appointments.id,
        status: appointments.status,
        startsAt: appointments.startsAt,
      });

    await transaction.insert(formSubmissions).values({
      formKey: "booking",
      payload,
      sourcePath: "/book",
    });

    return created;
  });

  if (!booking) {
    return Response.json(
      {
        ok: false,
        error:
          "That time is no longer available. Please choose another time.",
      },
      { status: 409 },
    );
  }

  const bookingTime = new Intl.DateTimeFormat("en-JM", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: availability.timeZone,
  }).format(booking.startsAt);

  await Promise.all([
    sendWebsiteMail({
      to: parsed.data.email,
      subject: "CH Elevate consultation request received",
      text: `Hello ${parsed.data.name},\n\nWe received your consultation request for ${bookingTime}. An administrator will review it and confirm the booking by email.\n\nCH Elevate Consultancy Limited\ninfo@ch-elevateconsultancy.com`,
    }),
    sendPrimaryInboxMail({
      replyTo: parsed.data.email,
      subject: `New consultation request from ${parsed.data.name}`,
      text: [
        `Name: ${parsed.data.name}`,
        `Email: ${parsed.data.email}`,
        `Phone: ${parsed.data.phone}`,
        `Company: ${parsed.data.company || "Not provided"}`,
        `Service: ${parsed.data.service}`,
        `Requested time: ${bookingTime}`,
        `Timeline: ${parsed.data.timeline}`,
        "",
        parsed.data.priority,
      ].join("\n"),
    }),
  ]);

  return Response.json({ ok: true, booking }, { status: 201 });
}
