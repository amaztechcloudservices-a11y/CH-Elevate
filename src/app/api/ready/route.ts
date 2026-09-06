import { sql } from "drizzle-orm";
import { getCourseStorageStatus } from "@/server/course-storage";
import { getDb } from "@/server/db";
import { getSiteMailConfig } from "@/server/site-mail";

export const dynamic = "force-dynamic";

export async function GET() {
  const smtpConfigured = Boolean(getSiteMailConfig().smtpUrl);
  const checks = {
    database: { ready: false, reason: "Database is unavailable." },
    storage: await getCourseStorageStatus(),
    email: {
      ready: smtpConfigured,
      configured: smtpConfigured,
      reachable: null,
      reason: smtpConfigured ? "SMTP is configured; live connectivity is checked in System Settings." : "SMTP is not configured.",
    },
  };
  try {
    await getDb().execute(sql`select 1`);
    checks.database = { ready: true, reason: "Database connection succeeded." };
  } catch {}
  const ready = checks.database.ready && checks.storage.ready;
  return Response.json({ ok: ready, service: "ch-elevate", checks, timestamp: new Date().toISOString() }, {
    status: ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
