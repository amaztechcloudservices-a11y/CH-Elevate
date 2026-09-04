import { expect, it } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument, PDFName, PDFDict } from "pdf-lib";
import { createCourseCertificatePdf } from "./course-certificate-pdf";
const certificate = { certificateNumber: "CHE-2097-12345678", participantName: "José Élise Long-Name", courseTitle: "Leadership & delivery — foundations", completedAt: new Date("2097-09-05T17:00:00Z"), issuedAt: new Date("2097-09-06T17:00:00Z") };
it("creates a single landscape certificate with embedded brand fonts and no scripts or attachments", async () => {
  const bytes = await createCourseCertificatePdf(certificate); const pdf = await PDFDocument.load(bytes);
  expect(pdf.getPageCount()).toBe(1); expect(pdf.getPage(0).getSize()).toEqual({ width: 842, height: 595 });
  expect(pdf.getSubject()).toBe(certificate.certificateNumber);
  expect(pdf.catalog.has(PDFName.of("Names"))).toBe(false); expect(pdf.catalog.has(PDFName.of("OpenAction"))).toBe(false);
  const fonts = pdf.getPage(0).node.Resources()!.lookup(PDFName.of("Font"), PDFDict);
  expect(new Set(fonts.keys().map((key) => fonts.get(key)?.toString())).size).toBe(2);
  for (const key of fonts.keys()) expect(fonts.lookup(key, PDFDict).get(PDFName.of("Subtype"))?.toString()).toBe("/Type0");
  const longText = await createCourseCertificatePdf({ ...certificate, participantName: "W".repeat(120), courseTitle: "W".repeat(180) });
  expect((await PDFDocument.load(longText)).getPageCount()).toBe(1);
  await mkdir("test-results/certificate-preview", { recursive: true });
  await writeFile("test-results/certificate-preview/standard.pdf", bytes);
  await writeFile("test-results/certificate-preview/long-text.pdf", longText);
});
it("fails closed instead of dropping unsupported characters or clipping overflowing text", async () => {
  await expect(createCourseCertificatePdf({ ...certificate, participantName: "Unsupported 😀" })).rejects.toThrow(/cannot display/);
  await expect(createCourseCertificatePdf({ ...certificate, participantName: "Long name ".repeat(150) })).rejects.toThrow(/too long/);
  await expect(createCourseCertificatePdf({ ...certificate, completedAt: new Date("invalid") })).rejects.toThrow(/dates need correction/);
});
