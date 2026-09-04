import { expect, it } from "vitest";
import { PDFDocument, PDFName, PDFDict } from "pdf-lib";
import { participantReportSchema } from "@/lib/course-participant-report";
import { createParticipantPdf } from "./course-participant-pdf";
const row = { participantId: "11111111-1111-4111-8111-111111111111", name: "José Long-Name", email: "student@example.test", status: "approved", attendance: "not_recorded", offeringCode: "OCTOBER", startsAt: new Date("2097-10-01"), timeZone: "America/Jamaica", organisationName: "Example organisation" };
it("validates an explicit unique selection within a single course", () => {
  expect(participantReportSchema.safeParse({ courseId: row.participantId, participantIds: [row.participantId] }).success).toBe(true);
  expect(participantReportSchema.safeParse({ courseId: row.participantId, participantIds: [row.participantId, row.participantId] }).success).toBe(false);
  expect(participantReportSchema.safeParse({ courseId: row.participantId, participantIds: [] }).success).toBe(false);
});
it("creates a paginated PDF with embedded display/body fonts and no attachments or scripts", async () => {
  const bytes = await createParticipantPdf("Leadership & delivery — foundations", Array.from({ length: 65 }, (_, index) => ({ ...row, name: `${row.name} ${index + 1}` })), new Date("2097-09-01T15:00:00Z"));
  const document = await PDFDocument.load(bytes);
  expect(document.getPageCount()).toBeGreaterThan(2); expect(document.getSubject()).toBe("65 selected participant records");
  expect(document.catalog.has(PDFName.of("Names"))).toBe(false); expect(document.catalog.has(PDFName.of("OpenAction"))).toBe(false);
  const fonts = document.getPage(0).node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
  expect(new Set(fonts.keys().map((key) => fonts.get(key)?.toString())).size).toBe(2);
  for (const fontKey of fonts.keys()) expect(fonts.lookup(fontKey, PDFDict).get(PDFName.of("Subtype"))?.toString()).toBe("/Type0");
  await expect(createParticipantPdf("Course", [{ ...row, name: "Unsupported 😀" }])).rejects.toThrow(/cannot display/);
});
