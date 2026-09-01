import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { auditLogs, courseOfferings, courseRegistrations, organisations, registrationParticipants } from "@/db/schema";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { getDb } from "@/server/db";

const metadataSchema = z.object({ offeringId: z.uuid(), organisationName: z.string().trim().min(2).max(180), applicantName: z.string().trim().min(2).max(120), applicantEmail: z.email().max(254).transform((value) => value.toLowerCase()) });

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = lines.shift()?.split(",").map((value) => value.trim().toLowerCase()) || [];
  const nameIndex = headers.indexOf("name"), emailIndex = headers.indexOf("email"), phoneIndex = headers.indexOf("phone");
  if (nameIndex < 0 || emailIndex < 0) throw new Error("CSV headers must include name and email; phone is optional.");
  return lines.map((line) => { const cells = line.split(",").map((value) => value.trim().replace(/^"|"$/g, "")); return { name: cells[nameIndex], email: cells[emailIndex]?.toLowerCase(), phone: phoneIndex >= 0 ? cells[phoneIndex] : "" }; }).filter((row) => row.name && row.email);
}

export async function POST(request: Request) {
  try {
    const { session } = await requireClientAdmin(request);
    const form = await request.formData();
    const parsed = metadataSchema.safeParse(Object.fromEntries(form.entries()));
    const file = form.get("file");
    if (!parsed.success || !(file instanceof File) || file.size > 1024 * 1024) return Response.json({ ok: false, error: { message: parsed.success ? "Choose a CSV file smaller than 1 MB." : parsed.error.issues[0]?.message } }, { status: 422 });
    const participants = parseCsv(await file.text());
    if (!participants.length || participants.length > 250) return Response.json({ ok: false, error: { message: "The CSV must contain between 1 and 250 participants." } }, { status: 422 });
    const emails = participants.map((row) => row.email);
    if (new Set(emails).size !== emails.length) return Response.json({ ok: false, error: { message: "The CSV contains duplicate email addresses." } }, { status: 409 });
    const database = getDb();
    const result = await database.transaction(async (tx) => {
      const [offering] = await tx.select().from(courseOfferings).where(eq(courseOfferings.id, parsed.data.offeringId)).limit(1);
      if (!offering) return null;
      const duplicates = await tx.select({ email: registrationParticipants.email }).from(registrationParticipants).where(and(eq(registrationParticipants.offeringId, offering.id), inArray(registrationParticipants.emailNormalized, emails)));
      if (duplicates.length) throw new Error(`${duplicates[0].email} is already registered for this offering.`);
      const [organisation] = await tx.insert(organisations).values({ name: parsed.data.organisationName, billingEmail: parsed.data.applicantEmail }).returning();
      const [registration] = await tx.insert(courseRegistrations).values({ offeringId: offering.id, organisationId: organisation.id, applicantName: parsed.data.applicantName, applicantEmail: parsed.data.applicantEmail, amountDueCents: offering.feeCents * participants.length }).returning();
      await tx.insert(registrationParticipants).values(participants.map((row) => ({ registrationId: registration.id, offeringId: offering.id, name: row.name, email: row.email, emailNormalized: row.email, phone: row.phone || null })));
      await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: "course.roster_imported", entityType: "course_registration", entityId: registration.id, metadata: { seats: participants.length } });
      return registration;
    });
    if (!result) return Response.json({ ok: false, error: { message: "Offering not found." } }, { status: 404 });
    return Response.json({ ok: true, data: result }, { status: 201 });
  } catch (error) { return adminErrorResponse(error); }
}
