import { count, desc, eq, gt, sql } from "drizzle-orm";
import { auditLogs, bookingMailDeliveries, profiles, session, user } from "@/db/schema";
import { requireClientAdmin, adminErrorResponse } from "@/server/admin-auth";
import { getCourseStorageStatus } from "@/server/course-storage";
import { getDb } from "@/server/db";
import { getSiteMailConfig } from "@/server/site-mail";
import { getWebsiteCms } from "@/server/website-cms";

export async function GET(request: Request) {
  try {
    await requireClientAdmin(request);
    const database = getDb();
    const now = new Date();
    const [settings, storage, staff, sessions, mailStates, latestAudit] = await Promise.all([
      getWebsiteCms().then((cms) => cms.settings),
      getCourseStorageStatus(),
      database.select({ id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified, role: profiles.role, active: profiles.active, updatedAt: profiles.updatedAt }).from(profiles).innerJoin(user, eq(user.id, profiles.authUserId)).where(eq(profiles.role, "client_admin")).orderBy(user.name),
      database.select({ value: count() }).from(session).where(gt(session.expiresAt, now)),
      database.select({ state: bookingMailDeliveries.state, value: count() }).from(bookingMailDeliveries).groupBy(bookingMailDeliveries.state),
      database.select({ action: auditLogs.action, createdAt: auditLogs.createdAt }).from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(1),
      database.execute(sql`select 1`),
    ]);
    const smtpConfigured = Boolean(getSiteMailConfig().smtpUrl);
    return Response.json({ ok: true, data: {
      business: { email: settings.footerEmail, phone: settings.footerPhone, address: settings.footerAddress, timeZone: "America/Jamaica", locale: "en-JM", defaultCurrency: "JMD" },
      access: { staff, activeSessions: sessions[0]?.value ?? 0, mfa: { configured: false, note: "MFA is not configured in the current authentication provider." } },
      notifications: { smtpConfigured, bookingMailStates: Object.fromEntries(mailStates.map((row) => [row.state, row.value])), note: "Course and website mail currently report provider acceptance synchronously; durable retry migration remains required." },
      health: { database: { ready: true }, storage, email: { ready: smtpConfigured } },
      audit: { latest: latestAudit[0] ?? null },
      recovery: { lastBackupAt: process.env.LAST_BACKUP_AT || null, lastRestoreTestAt: process.env.LAST_RESTORE_TEST_AT || null, buildVersion: process.env.APP_VERSION || process.env.VERCEL_GIT_COMMIT_SHA || "development" },
    } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return adminErrorResponse(error); }
}
