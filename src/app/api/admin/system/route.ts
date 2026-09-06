import { count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { auditLogs, bookingMailDeliveries, operationalMailDeliveries, profiles, session, user } from "@/db/schema";
import { requireClientAdmin, adminErrorResponse } from "@/server/admin-auth";
import { getCourseStorageStatus } from "@/server/course-storage";
import { getDb } from "@/server/db";
import { checkSiteMailConnection, deliverOperationalMail } from "@/server/site-mail";
import { getWebsiteCms } from "@/server/website-cms";

export async function GET(request: Request) {
  try {
    await requireClientAdmin(request);
    const database = getDb();
    const now = new Date();
    const [settings, storage, staff, sessions, bookingMailStates, operationalMailStates, mailAttention, latestAudit, , smtpHealth] = await Promise.all([
      getWebsiteCms().then((cms) => cms.settings),
      getCourseStorageStatus(),
      database.select({ id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, role: profiles.role, active: profiles.active, updatedAt: profiles.updatedAt }).from(profiles).innerJoin(user, eq(user.id, profiles.authUserId)).where(eq(profiles.role, "client_admin")).orderBy(user.name),
      database.select({ value: count() }).from(session).where(gt(session.expiresAt, now)),
      database.select({ state: bookingMailDeliveries.state, value: count() }).from(bookingMailDeliveries).groupBy(bookingMailDeliveries.state),
      database.select({ state: operationalMailDeliveries.state, value: count() }).from(operationalMailDeliveries).groupBy(operationalMailDeliveries.state),
      database.select({ id: operationalMailDeliveries.id, channel: operationalMailDeliveries.channel, recipient: operationalMailDeliveries.recipient, subject: operationalMailDeliveries.subject, state: operationalMailDeliveries.state, attempts: operationalMailDeliveries.attempts, errorCode: operationalMailDeliveries.errorCode, updatedAt: operationalMailDeliveries.updatedAt }).from(operationalMailDeliveries).where(inArray(operationalMailDeliveries.state, ["pending", "sending", "failed", "unknown"])).orderBy(desc(operationalMailDeliveries.updatedAt)).limit(25),
      database.select({ action: auditLogs.action, createdAt: auditLogs.createdAt }).from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(1),
      database.execute(sql`select 1`),
      checkSiteMailConnection(),
    ]);
    return Response.json({ ok: true, data: {
      business: { email: settings.footerEmail, phone: settings.footerPhone, address: settings.footerAddress, timeZone: "America/Jamaica", locale: "en-JM", defaultCurrency: "JMD" },
      access: { staff, activeSessions: sessions[0]?.value ?? 0, mfa: { configured: false, note: "MFA is not configured in the current authentication provider." } },
      notifications: { smtpConfigured: smtpHealth.configured, bookingMailStates: Object.fromEntries(bookingMailStates.map((row) => [row.state, row.value])), operationalMailStates: Object.fromEntries(operationalMailStates.map((row) => [row.state, row.value])), attention: mailAttention, note: "Website and course mail is persisted before delivery. Failed messages retry with backoff; uncertain sends require review to avoid duplicates." },
      health: { database: { ready: true }, storage, email: smtpHealth },
      audit: { latest: latestAudit[0] ?? null },
      recovery: { lastBackupAt: process.env.LAST_BACKUP_AT || null, lastRestoreTestAt: process.env.LAST_RESTORE_TEST_AT || null, buildVersion: process.env.APP_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || "development" },
    } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}

const retrySchema = z.object({ id: z.uuid(), confirmUnknown: z.boolean().default(false) }).strict();
export async function PATCH(request: Request) {
  try {
    const { session: adminSession } = await requireClientAdmin(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ ok: false, error: { message: "A same-origin request is required." } }, { status: 403 });
    const parsed = retrySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ ok: false, error: { message: "Choose a valid delivery to retry." } }, { status: 422 });
    const result = await deliverOperationalMail(parsed.data.id, parsed.data.confirmUnknown);
    await getDb().insert(auditLogs).values({ actorAuthUserId: adminSession.user.id, action: "system.operational_mail_retry", entityType: "operational_mail_delivery", entityId: parsed.data.id, metadata: { state: result.state, confirmedUncertainRetry: parsed.data.confirmUnknown } });
    return Response.json({ ok: true, data: result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
