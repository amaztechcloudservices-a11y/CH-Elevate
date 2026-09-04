import { eq } from "drizzle-orm";
import { courseCertificates, registrationParticipants } from "@/db/schema";
import { isCurrentCourseCertificate } from "@/lib/courses";
import { getDb } from "@/server/db";

export async function GET(request: Request) {
  const number = new URL(request.url).searchParams.get("number")?.trim().toUpperCase();
  if (!number || number.length > 80 || !process.env.DATABASE_URL) return Response.json({ ok: false }, { status: 404 });
  const [row] = await getDb().select({ certificateNumber: courseCertificates.certificateNumber, participantName: courseCertificates.participantName, courseTitle: courseCertificates.courseTitle, completedAt: courseCertificates.completedAt, issuedAt: courseCertificates.issuedAt, revokedAt: courseCertificates.revokedAt, participant: { status: registrationParticipants.status, attendance: registrationParticipants.attendance, completedAt: registrationParticipants.completedAt } }).from(courseCertificates).innerJoin(registrationParticipants, eq(registrationParticipants.id, courseCertificates.participantId)).where(eq(courseCertificates.certificateNumber, number)).limit(1);
  if (!row) return Response.json({ ok: false }, { status: 404 });
  const { participant, ...certificate } = row;
  return Response.json({ ok: true, data: { ...certificate, valid: isCurrentCourseCertificate(certificate, participant) } }, { headers: { "Cache-Control": "no-store" } });
}
