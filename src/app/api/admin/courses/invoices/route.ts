import { eq } from "drizzle-orm";
import { z } from "zod";

import { auditLogs, courseInvoices, coursePaymentRecords, courseRegistrations } from "@/db/schema";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { CourseFileError, savePrivateFile } from "@/server/course-storage";
import { getDb } from "@/server/db";

const invoiceSchema = z.object({ registrationId: z.uuid(), documentType: z.enum(["invoice", "receipt"]).default("invoice"), reference: z.string().trim().min(2).max(100), amountCents: z.coerce.number().int().min(0), dueAt: z.string().optional().default(""), notes: z.string().trim().max(1000).optional().default("") });

export async function POST(request: Request) {
  try {
    const { session } = await requireClientAdmin(request);
    const form = await request.formData();
    const parsed = invoiceSchema.safeParse(Object.fromEntries(form.entries()));
    const file = form.get("file");
    if (!parsed.success || !(file instanceof File) || file.type !== "application/pdf") return Response.json({ ok: false, error: { message: parsed.success ? "Invoices must be PDF files." : parsed.error.issues[0]?.message } }, { status: 422 });
    const stored = await savePrivateFile(file, "invoices");
    const status = parsed.data.documentType === "receipt" ? "paid" as const : "invoiced" as const;
    const [invoice] = await getDb().insert(courseInvoices).values({ registrationId: parsed.data.registrationId, documentType: parsed.data.documentType, reference: parsed.data.reference, amountCents: parsed.data.amountCents, dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null, notes: parsed.data.notes || null, storageKey: stored.storageKey, originalFilename: stored.originalFilename }).returning();
    await getDb().update(courseRegistrations).set({ paymentStatus: status, amountDueCents: parsed.data.amountCents, paymentReference: parsed.data.documentType === "receipt" ? parsed.data.reference : undefined, updatedAt: new Date() }).where(eq(courseRegistrations.id, parsed.data.registrationId));
    await getDb().insert(coursePaymentRecords).values({ registrationId: parsed.data.registrationId, status, amountCents: parsed.data.amountCents, reference: parsed.data.reference, notes: parsed.data.notes || null, recordedByAuthUserId: session.user.id });
    await getDb().insert(auditLogs).values({ actorAuthUserId: session.user.id, action: `course.${parsed.data.documentType}_uploaded`, entityType: "course_invoice", entityId: invoice.id });
    return Response.json({ ok: true, data: invoice }, { status: 201 });
  } catch (error) {
    if (error instanceof CourseFileError) return Response.json({ ok: false, error: { message: error.message } }, { status: 422 });
    return adminErrorResponse(error);
  }
}
