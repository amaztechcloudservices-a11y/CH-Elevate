import { and, eq, inArray, or } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { auditLogs, courseCertificates, courseInvoices, courseMaterials, courseOfferings, courseRegistrations, organisationMemberships, profiles, registrationParticipants } from "@/db/schema";
import { getAuth } from "@/server/auth";
import { privateFileResponse } from "@/server/course-storage";
import { getDb } from "@/server/db";

export async function GET(request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await context.params;
  if (!["material", "invoice", "receipt", "certificate"].includes(kind)) return new Response("Not found", { status: 404 });
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return new Response("Sign in required", { status: 401 });
  const database = getDb();
  const [profile] = await database.select().from(profiles).where(eq(profiles.authUserId, session.user.id)).limit(1);
  if (!profile?.active) return new Response("Forbidden", { status: 403 });
  const isAdmin = profile.role === "client_admin";

  if (kind === "certificate") {
    const [row] = await database.select({ certificate: courseCertificates, ownerProfileId: registrationParticipants.profileId }).from(courseCertificates).innerJoin(registrationParticipants, eq(registrationParticipants.id, courseCertificates.participantId)).where(eq(courseCertificates.id, id)).limit(1);
    if (!row || row.certificate.revokedAt || (!isAdmin && row.ownerProfileId !== profile.id)) return new Response("Forbidden", { status: 403 });
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([842, 595]);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawRectangle({ x: 18, y: 18, width: 806, height: 559, borderColor: rgb(0.04, 0.18, 0.43), borderWidth: 3 });
    page.drawText("CH ELEVATE", { x: 330, y: 510, size: 24, font: bold, color: rgb(0.04, 0.18, 0.43) });
    page.drawText("Certificate of Completion", { x: 226, y: 420, size: 34, font: bold, color: rgb(0.03, 0.08, 0.18) });
    page.drawText("This certifies that", { x: 350, y: 365, size: 14, font: regular, color: rgb(0.28, 0.32, 0.41) });
    page.drawText(row.certificate.participantName, { x: 220, y: 315, size: 30, font: bold, color: rgb(0.04, 0.26, 0.84) });
    page.drawText(`has successfully completed ${row.certificate.courseTitle}`, { x: 210, y: 270, size: 16, font: regular, color: rgb(0.03, 0.08, 0.18) });
    page.drawText(`Completed ${row.certificate.completedAt.toLocaleDateString("en-JM", { dateStyle: "long", timeZone: "America/Jamaica" })}`, { x: 300, y: 220, size: 13, font: regular });
    page.drawText(`Certificate ${row.certificate.certificateNumber}`, { x: 300, y: 90, size: 11, font: regular, color: rgb(0.28, 0.32, 0.41) });
    const bytes = await pdf.save();
    await database.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.certificate_downloaded", entityType: "course_certificate", entityId: id });
    return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${row.certificate.certificateNumber}.pdf"`, "Cache-Control": "private, no-store" } });
  }

  if (kind === "invoice" || kind === "receipt") {
    const [invoice] = await database.select().from(courseInvoices).where(eq(courseInvoices.id, id)).limit(1);
    if (!invoice) return new Response("Not found", { status: 404 });
    if (invoice.documentType !== kind) return new Response("Not found", { status: 404 });
    if (!isAdmin) {
      const participantAccess = await database.select({ id: registrationParticipants.id }).from(registrationParticipants).where(and(eq(registrationParticipants.registrationId, invoice.registrationId), eq(registrationParticipants.profileId, profile.id))).limit(1);
      const coordinatorAccess = await database.select({ id: organisationMemberships.id }).from(courseRegistrations).innerJoin(organisationMemberships, eq(organisationMemberships.organisationId, courseRegistrations.organisationId)).where(and(eq(courseRegistrations.id, invoice.registrationId), eq(organisationMemberships.profileId, profile.id), eq(organisationMemberships.role, "coordinator"))).limit(1);
      if (!participantAccess.length && !coordinatorAccess.length) return new Response("Forbidden", { status: 403 });
    }
    await database.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: `course.${kind}_downloaded`, entityType: "course_invoice", entityId: id });
    return privateFileResponse(invoice.storageKey, invoice.originalFilename, "application/pdf");
  }

  const [material] = await database.select().from(courseMaterials).where(eq(courseMaterials.id, id)).limit(1);
  if (!material || material.isArchived) return new Response("Not found", { status: 404 });
  if (!isAdmin) {
    const memberships = await database.select({ organisationId: organisationMemberships.organisationId }).from(organisationMemberships).where(and(eq(organisationMemberships.profileId, profile.id), eq(organisationMemberships.role, "coordinator")));
    const organisationIds = memberships.map((row) => row.organisationId);
    const conditions = [eq(registrationParticipants.profileId, profile.id)];
    if (organisationIds.length) conditions.push(inArray(courseRegistrations.organisationId, organisationIds));
    const access = await database.select({ id: registrationParticipants.id }).from(registrationParticipants).innerJoin(courseRegistrations, eq(courseRegistrations.id, registrationParticipants.registrationId)).innerJoin(courseOfferings, eq(courseOfferings.id, registrationParticipants.offeringId)).where(and(or(...conditions), inArray(registrationParticipants.status, ["approved", "completed"]), material.offeringId ? eq(registrationParticipants.offeringId, material.offeringId) : undefined, material.courseId ? eq(courseOfferings.courseId, material.courseId) : undefined)).limit(1);
    if (!access.length) return new Response("Forbidden", { status: 403 });
  }
  await database.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.material_downloaded", entityType: "course_material", entityId: id, metadata: { version: material.version } });
  return privateFileResponse(material.storageKey, material.originalFilename, material.mimeType);
}
