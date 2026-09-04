import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { appointments, auditLogs, bookingEmailSettings, bookingMailDeliveries } from "@/db/schema";
import { bookingMailKinds, bookingMailPreviewValues, bookingMailSettingsSchema } from "@/lib/booking-mail";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { deliverBookingMail, readBookingMailSettings, sendBookingSmtp } from "@/server/booking-mail";
import { getDb } from "@/server/db";

const failure = (message: string, status: number) => Response.json({ ok: false, error: { message } }, { status });
const mutations = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), data: bookingMailSettingsSchema, updatedAt: z.iso.datetime().nullable() }).strict(),
  z.object({ action: z.literal("test"), kind: z.enum(bookingMailKinds) }).strict(),
  z.object({ action: z.literal("retry"), id: z.uuid(), confirmUnknown: z.boolean().default(false) }).strict(),
]);
export async function GET(request: Request) {
  try {
    const { session } = await requireClientAdmin(request);
    const query = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), attention: z.enum(["true", "false"]).default("true") }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) return failure("Invalid delivery filters.", 422);
    const { page, attention } = query.data;
    const db = getDb();
    const where = attention === "true" ? inArray(bookingMailDeliveries.state, ["pending", "sending", "failed", "unknown"]) : undefined;
    const [settings, deliveries, [total]] = await Promise.all([
      readBookingMailSettings(),
      db.select({ id: bookingMailDeliveries.id, bookingId: bookingMailDeliveries.bookingId, kind: bookingMailDeliveries.kind, state: bookingMailDeliveries.state, attempts: bookingMailDeliveries.attempts, errorCode: bookingMailDeliveries.errorCode, updatedAt: bookingMailDeliveries.updatedAt, customerName: appointments.customerName, service: appointments.service }).from(bookingMailDeliveries).innerJoin(appointments, eq(appointments.id, bookingMailDeliveries.bookingId)).where(where).orderBy(desc(bookingMailDeliveries.createdAt), desc(bookingMailDeliveries.id)).limit(50).offset((page - 1) * 50),
      db.select({ value: count() }).from(bookingMailDeliveries).where(where),
    ]);
    return Response.json({ ok: true, ...settings, deliveries, total: total.value, pageSize: 50, smtpConfigured: Boolean(process.env.SMTP_URL?.trim()), testRecipient: session.user.email }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    const { session } = await requireClientAdmin(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) return failure("A same-origin request is required.", 403);
    const parsed = mutations.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return failure(parsed.error.issues[0]?.message || "Review the email settings.", 422);
    const input = parsed.data; const db = getDb();
    if (input.action === "save") return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('ch-elevate-booking-email-settings'))`);
      const current = await readBookingMailSettings(tx);
      if (current.updatedAt !== input.updatedAt) return failure("Email settings changed in another window. Reload before saving.", 409);
      const updatedAt = new Date(Math.max(Date.now(), current.updatedAt ? Date.parse(current.updatedAt) + 1 : 0));
      await tx.insert(bookingEmailSettings).values({ id: "default", data: input.data, updatedAt }).onConflictDoUpdate({ target: bookingEmailSettings.id, set: { data: input.data, updatedAt } });
      await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "booking.email_settings_updated", entityType: "booking_email_settings", entityId: "default" });
      return Response.json({ ok: true, data: input.data, updatedAt });
    });
    if (input.action === "test") {
      const { data } = await readBookingMailSettings();
      const result = await sendBookingSmtp(data, input.kind, bookingMailPreviewValues, session.user.email, randomUUID());
      await db.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "booking.email_test", entityType: "booking_email_settings", entityId: "default", metadata: result });
      return Response.json({ ok: true, result });
    }
    const [delivery] = await db.select({ id: bookingMailDeliveries.id }).from(bookingMailDeliveries).where(and(eq(bookingMailDeliveries.id, input.id))).limit(1);
    if (!delivery) return failure("Delivery record not found.", 404);
    const result = await deliverBookingMail(input.id, input.confirmUnknown);
    await db.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "booking.email_retry", entityType: "booking_mail_delivery", entityId: input.id, metadata: { ...result, confirmedUncertainRetry: input.confirmUnknown } });
    return Response.json({ ok: true, result });
  } catch (error) { return adminErrorResponse(error); }
}
