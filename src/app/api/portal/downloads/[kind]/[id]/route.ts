import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { isCurrentCourseCertificate } from "@/lib/courses";

import { auditLogs, courseCertificates, courseInvoices, courseMaterials, courseOfferings, courseRegistrations, organisationMemberships, profiles, registrationParticipants } from "@/db/schema";
import { getAuth } from "@/server/auth";
import { privateFileResponse } from "@/server/course-storage";
import { getDb } from "@/server/db";
import { CertificatePdfError, createCourseCertificatePdf } from "@/server/course-certificate-pdf";

export async function GET(request: Request, context: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await context.params;
  if (!["material", "invoice", "receipt", "certificate"].includes(kind) || !z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user) return new Response("Sign in required", { status: 401 });
  const database = getDb();
  const [profile] = await database.select().from(profiles).where(eq(profiles.authUserId, session.user.id)).limit(1);
  if (!profile?.active) return new Response("Forbidden", { status: 403 });
  const isAdmin = profile.role === "client_admin";

  if (kind === "certificate") {
    const [row] = await database.select({ certificate: courseCertificates, participant: registrationParticipants }).from(courseCertificates).innerJoin(registrationParticipants, eq(registrationParticipants.id, courseCertificates.participantId)).where(eq(courseCertificates.id, id)).limit(1);
    if (!row || !isCurrentCourseCertificate(row.certificate, row.participant) || (!isAdmin && (profile.role !== "customer" || row.participant.profileId !== profile.id))) return new Response("Forbidden", { status: 403 });
    let bytes: Uint8Array;
    try { bytes = await createCourseCertificatePdf(row.certificate); }
    catch (error) { return new Response(error instanceof CertificatePdfError ? error.message : "The certificate PDF is temporarily unavailable.", { status: error instanceof CertificatePdfError ? 422 : 503, headers: { "Cache-Control": "private, no-store" } }); }
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
    if (!material.courseId && !material.offeringId) return new Response("Forbidden", { status: 403 });
    if (material.recipientProfileId && material.recipientProfileId !== profile.id) return new Response("Forbidden", { status: 403 });
    const memberships = await database.select({ organisationId: organisationMemberships.organisationId }).from(organisationMemberships).where(and(eq(organisationMemberships.profileId, profile.id), eq(organisationMemberships.role, "coordinator")));
    const organisationIds = memberships.map((row) => row.organisationId);
    const conditions = [eq(registrationParticipants.profileId, profile.id)];
    if (organisationIds.length && !material.recipientProfileId) conditions.push(inArray(courseRegistrations.organisationId, organisationIds));
    const access = await database.select({ id: registrationParticipants.id }).from(registrationParticipants).innerJoin(courseRegistrations, eq(courseRegistrations.id, registrationParticipants.registrationId)).innerJoin(courseOfferings, eq(courseOfferings.id, registrationParticipants.offeringId)).where(and(or(...conditions), inArray(registrationParticipants.status, ["approved", "completed"]), material.offeringId ? eq(registrationParticipants.offeringId, material.offeringId) : undefined, material.courseId ? eq(courseOfferings.courseId, material.courseId) : undefined)).limit(1);
    if (!access.length) return new Response("Forbidden", { status: 403 });
  }
  await database.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.material_downloaded", entityType: "course_material", entityId: id, metadata: { version: material.version } });
  return privateFileResponse(material.storageKey, material.originalFilename, material.mimeType);
}
