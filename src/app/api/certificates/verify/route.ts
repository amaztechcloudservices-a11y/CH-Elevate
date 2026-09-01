import { eq } from "drizzle-orm";
import { courseCertificates } from "@/db/schema";
import { getDb } from "@/server/db";

export async function GET(request: Request) {
  const number = new URL(request.url).searchParams.get("number")?.trim().toUpperCase();
  if (!number || number.length > 80 || !process.env.DATABASE_URL) return Response.json({ ok: false }, { status: 404 });
  const [row] = await getDb().select({ certificateNumber: courseCertificates.certificateNumber, participantName: courseCertificates.participantName, courseTitle: courseCertificates.courseTitle, completedAt: courseCertificates.completedAt, issuedAt: courseCertificates.issuedAt, revokedAt: courseCertificates.revokedAt }).from(courseCertificates).where(eq(courseCertificates.certificateNumber, number)).limit(1);
  if (!row) return Response.json({ ok: false }, { status: 404 });
  return Response.json({ ok: true, data: { ...row, valid: !row.revokedAt } });
}
