import { eq } from "drizzle-orm";
import { z } from "zod";

import { auditLogs, courseInvoices, courseRegistrations } from "@/db/schema";
import { adminErrorResponse, requireClientAdmin } from "@/server/admin-auth";
import { CourseFileError, discardPrivateUpload, savePrivateFile } from "@/server/course-storage";
import { readCourseUpload } from "@/server/course-upload";
import { getDb } from "@/server/db";

const invoiceSchema = z.object({
  registrationId: z.uuid(), documentType: z.enum(["invoice", "receipt"]).default("invoice"),
  reference: z.string().trim().min(2).max(100),
  amountCents: z.string().trim().regex(/^\d+$/, "Enter an amount in whole cents.").transform(Number).pipe(z.number().int().min(0).max(2147483647)),
  dueAt: z.union([z.iso.date(), z.literal("")]).optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""), file: z.instanceof(File),
}).strict();
const fail = (message: string, status: number) => Response.json({ ok: false, error: { message } }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  let stored: Awaited<ReturnType<typeof savePrivateFile>> | undefined;
  try {
    const { session } = await requireClientAdmin(request);
    if (request.headers.get("origin") !== new URL(request.url).origin) return fail("A same-origin request is required.", 403);
    const entries = [...(await readCourseUpload(request)).entries()];
    if (new Set(entries.map(([key]) => key)).size !== entries.length) return fail("Duplicate upload fields are not allowed.", 422);
    const parsed = invoiceSchema.safeParse(Object.fromEntries(entries));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Review the document details.", 422);
    const input = parsed.data;
    if (input.file.type !== "application/pdf") return fail("Invoices and receipts must be PDF files.", 422);
    const result = await getDb().transaction(async (tx) => {
      const [registration] = await tx.select({ id: courseRegistrations.id }).from(courseRegistrations).where(eq(courseRegistrations.id, input.registrationId)).for("update");
      if (!registration) return fail("Registration not found.", 404);
      // Keep the file provisional until its private metadata and audit write commit together.
      stored = await savePrivateFile(input.file, "invoices");
      const [invoice] = await tx.insert(courseInvoices).values({ registrationId: input.registrationId, documentType: input.documentType, reference: input.reference, amountCents: input.amountCents, dueAt: input.dueAt ? new Date(input.dueAt) : null, notes: input.notes || null, storageKey: stored.storageKey, originalFilename: stored.originalFilename }).returning({ id: courseInvoices.id, registrationId: courseInvoices.registrationId, documentType: courseInvoices.documentType, reference: courseInvoices.reference, amountCents: courseInvoices.amountCents, dueAt: courseInvoices.dueAt, originalFilename: courseInvoices.originalFilename, createdAt: courseInvoices.createdAt });
      await tx.insert(auditLogs).values({ actorAuthUserId: session.user.id, action: `course.${input.documentType}_uploaded`, entityType: "course_invoice", entityId: invoice.id });
      return Response.json({ ok: true, data: invoice }, { status: 201, headers: { "Cache-Control": "no-store" } });
    });
    stored = undefined;
    return result;
  } catch (error) {
    if (stored) {
      try { await discardPrivateUpload(stored.storageKey); }
      catch { return fail("The upload failed and its provisional file could not be removed. Contact the administrator before retrying.", 500); }
    }
    if (error instanceof CourseFileError) return fail(error.message, 422);
    const cause = error as { code?: string; cause?: { code?: string } };
    if ((cause?.code || cause?.cause?.code) === "23505") return fail("That document reference already exists. Use a unique reference.", 409);
    return adminErrorResponse(error);
  }
}
