import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";
import { appointments, bookingEmailSettings, bookingMailDeliveries } from "@/db/schema";
import { bookingStatusLabels, questionnaireEntries } from "@/lib/admin-bookings";
import { bookingMailSettingsSchema, defaultBookingMailSettings, renderBookingMail, type BookingMailKind, type BookingMailValues, type BookingMailSettings } from "@/lib/booking-mail";
import { getDb } from "@/server/db";

type Transaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Booking = typeof appointments.$inferSelect;
export async function readBookingMailSettings(db: Pick<ReturnType<typeof getDb>, "select"> = getDb()) {
  const [row] = await db.select().from(bookingEmailSettings).where(eq(bookingEmailSettings.id, "default"));
  return { data: bookingMailSettingsSchema.parse(row?.data || defaultBookingMailSettings), updatedAt: row?.updatedAt.toISOString() || null };
}
export function bookingMailValues(booking: Booking): BookingMailValues {
  return {
    customerName: booking.customerName, eventTitle: booking.service,
    date: booking.startsAt.toLocaleDateString("en-JM", { dateStyle: "full", timeZone: booking.timeZone }),
    time: booking.startsAt.toLocaleTimeString("en-JM", { hour: "numeric", minute: "2-digit", timeZone: booking.timeZone }),
    timeZone: booking.timeZone, duration: String(Math.round((booking.endsAt.getTime() - booking.startsAt.getTime()) / 60000)),
    bookingId: booking.id, status: bookingStatusLabels[booking.status], company: booking.company || "Not provided", phone: booking.customerPhone || "Not provided", email: booking.customerEmail,
    questionnaire: questionnaireEntries(booking.questionnaire).map((item) => `${item.label}: ${item.value}`).join("\n"),
  };
}
export async function enqueueBookingMail(tx: Transaction, booking: Booking, kinds: BookingMailKind[]) {
  const { data: settings } = await readBookingMailSettings(tx);
  const ids: string[] = [];
  for (const kind of kinds) {
    const [row] = await tx.insert(bookingMailDeliveries).values({ bookingId: booking.id, bookingVersion: booking.updatedAt.toISOString(), kind, state: settings.templates[kind].enabled ? "pending" : "disabled" }).onConflictDoNothing().returning({ id: bookingMailDeliveries.id });
    if (row) ids.push(row.id);
  }
  return ids;
}
export type MailAttempt = { state: typeof bookingMailDeliveries.$inferSelect.state; errorCode?: string };
export async function deliverBookingMail(id: string, confirmUnknown = false): Promise<MailAttempt> {
  const db = getDb();
  const claimed = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(bookingMailDeliveries).where(eq(bookingMailDeliveries.id, id)).for("update");
    if (!row) return { result: { state: "failed", errorCode: "NOT_FOUND" } as MailAttempt };
    if (["accepted", "disabled", "superseded"].includes(row.state)) return { result: { state: row.state } };
    const stale = row.state === "sending" && Date.now() - row.updatedAt.getTime() > 120000;
    if (row.state === "sending" && !stale) return { result: { state: "sending" } as MailAttempt };
    if ((stale || row.state === "unknown") && !confirmUnknown) {
      await tx.update(bookingMailDeliveries).set({ state: "unknown", errorCode: "DELIVERY_UNCERTAIN" }).where(eq(bookingMailDeliveries.id, id));
      return { result: { state: "unknown", errorCode: "DELIVERY_UNCERTAIN" } as MailAttempt };
    }
    const [booking] = await tx.select().from(appointments).where(eq(appointments.id, row.bookingId));
    if (!booking || booking.deletedAt || booking.updatedAt.toISOString() !== row.bookingVersion) {
      await tx.update(bookingMailDeliveries).set({ state: "superseded", errorCode: "BOOKING_CHANGED", updatedAt: new Date() }).where(eq(bookingMailDeliveries.id, id));
      return { result: { state: "superseded", errorCode: "BOOKING_CHANGED" } as MailAttempt };
    }
    const { data: settings } = await readBookingMailSettings(tx);
    if (!settings.templates[row.kind].enabled) {
      await tx.update(bookingMailDeliveries).set({ state: "disabled", updatedAt: new Date() }).where(eq(bookingMailDeliveries.id, id));
      return { result: { state: "disabled" } as MailAttempt };
    }
    await tx.update(bookingMailDeliveries).set({ state: "sending", attempts: row.attempts + 1, updatedAt: new Date(), errorCode: null }).where(eq(bookingMailDeliveries.id, id));
    return { booking, kind: row.kind, settings };
  });
  if ("result" in claimed) return claimed.result!;
  const { settings, booking, kind } = claimed;
  const result = await sendBookingSmtp(settings, kind, bookingMailValues(booking), kind === "adminNew" ? settings.adminRecipient : booking.customerEmail, id);
  await db.update(bookingMailDeliveries).set({ state: result.state, errorCode: result.errorCode || null, updatedAt: new Date() }).where(eq(bookingMailDeliveries.id, id));
  return result;
}
export async function sendBookingSmtp(settings: BookingMailSettings, kind: BookingMailKind, values: BookingMailValues, to: string, id: string): Promise<MailAttempt> {
  if (!bookingMailSettingsSchema.shape.senderEmail.safeParse(to).success || (kind === "adminNew" && !bookingMailSettingsSchema.shape.senderEmail.safeParse(values.email).success)) return { state: "failed", errorCode: "INVALID_RECIPIENT" };
  const smtpUrl = process.env.SMTP_URL?.trim();
  if (!smtpUrl) return { state: "failed", errorCode: "SMTP_NOT_CONFIGURED" };
  let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
    try {
      // URL options are parsed by Nodemailer; its second argument sets mail defaults, not connection timeouts.
      const config = new URL(smtpUrl);
      if (!["smtp:", "smtps:"].includes(config.protocol)) return { state: "failed", errorCode: "SMTP_CONFIGURATION" };
      for (const [key, value] of Object.entries({ connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 })) config.searchParams.set(key, String(value));
      transport = nodemailer.createTransport(config.toString());
      const sent = await transport.sendMail({
        from: { name: settings.senderName, address: settings.senderEmail }, to,
        replyTo: kind === "adminNew" ? values.email : settings.replyTo,
        ...renderBookingMail(settings.templates[kind], values),
        messageId: `<booking-${id}@ch-elevateconsultancy.com>`, disableFileAccess: true, disableUrlAccess: true,
      });
      return sent.accepted?.length ? { state: "accepted" } : { state: "failed", errorCode: "RECIPIENT_REJECTED" };
    } catch (error) {
      const code = (error as { code?: string }).code;
      return code === "EAUTH" || code === "EENVELOPE" ? { state: "failed", errorCode: code } : { state: "unknown", errorCode: "DELIVERY_UNCERTAIN" };
    } finally { transport?.close(); }
}
export async function dispatchBookingMail(ids: string[]) {
  // Booking state is already committed. Delivery/reporting failures must never turn it into a failed booking response.
  return Promise.all(ids.map(async (id) => {
    try { return await deliverBookingMail(id); }
    catch { return { state: "unknown", errorCode: "DELIVERY_UNCERTAIN" } as MailAttempt; }
  }));
}
