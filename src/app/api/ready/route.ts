import { sql } from "drizzle-orm";
import { getCourseStorageStatus } from "@/server/course-storage";
import { getDb } from "@/server/db";
import { getSiteMailConfig } from "@/server/site-mail";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    database: { ready: false, reason: "Database is unavailable." },
    storage: await getCourseStorageStatus(),
    email: { ready: Boolean(getSiteMailConfig().smtpUrl), reason: getSiteMailConfig().smtpUrl ? "SMTP is configured." : "SMTP is not configured." },
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
