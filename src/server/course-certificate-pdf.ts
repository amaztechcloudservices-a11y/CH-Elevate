import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, rgb } from "pdf-lib";
import { reportLines } from "./course-participant-pdf";

export class CertificatePdfError extends Error {}
type Certificate = { certificateNumber: string; participantName: string; courseTitle: string; completedAt: Date; issuedAt: Date };
let assets: Promise<Buffer[]> | undefined;
const loadAssets = () => assets ??= Promise.all([
  readFile(path.join(process.cwd(), "public/fonts/reports/Manrope-Regular.ttf")),
  readFile(path.join(process.cwd(), "public/fonts/reports/Sora-Regular.ttf")),
  readFile(path.join(process.cwd(), "public/images/ch-elevate-logo.png")),
]).catch((error) => { assets = undefined; throw error; });

export async function createCourseCertificatePdf(certificate: Certificate) {
  if (![certificate.completedAt, certificate.issuedAt].every((date) => date instanceof Date && Number.isFinite(date.getTime()))) throw new CertificatePdfError("The certificate dates need correction.");
  const [bodyBytes, displayBytes, logoBytes] = await loadAssets();
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const body = await pdf.embedFont(bodyBytes, { subset: true }); const display = await pdf.embedFont(displayBytes, { subset: true }); const logo = await pdf.embedPng(logoBytes);
  pdf.setTitle("Certificate of Completion"); pdf.setAuthor("CH Elevate Consultancy Limited"); pdf.setSubject(certificate.certificateNumber); pdf.setCreationDate(certificate.issuedAt); pdf.setModificationDate(certificate.issuedAt);
  const page = pdf.addPage([842, 595]); const teal = rgb(0, 0.34, 0.32); const ink = rgb(0.08, 0.13, 0.2); const muted = rgb(0.32, 0.38, 0.43);
  function centered(text: string, y: number, size: number, font = body, color = ink) {
    page.drawText(text, { x: (842 - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });
  }
  function block(text: string, y: number, size: number, font: PDFFont, maxLines: number, color = ink, minimumSize = size) {
    let lines: string[];
    try { lines = reportLines(text, 680, font, size); while (lines.length > maxLines && size > minimumSize) { size--; lines = reportLines(text, 680, font, size); } }
    catch { throw new CertificatePdfError("The name or course title contains text the certificate fonts cannot display. Correct the record before downloading."); }
    if (lines.length > maxLines) throw new CertificatePdfError("The name or course title is too long for the certificate. Correct the record before downloading.");
    lines.forEach((line, index) => centered(line, y - index * (size + 8), size, font, color));
  }
  page.drawRectangle({ x: 24, y: 24, width: 794, height: 547, borderColor: teal, borderWidth: 2 });
  page.drawRectangle({ x: 34, y: 34, width: 774, height: 527, borderColor: rgb(0.88, 0.7, 0), borderWidth: 0.7 });
  const logoWidth = 185; page.drawImage(logo, { x: (842 - logoWidth) / 2, y: 494, width: logoWidth, height: logoWidth * logo.height / logo.width });
  centered("Certificate of Completion", 441, 30, display, teal);
  centered("This certifies that", 401, 13, body, muted);
  block(certificate.participantName, 364, 24, display, 3, teal, 16);
  centered("has successfully completed", 259, 13, body, muted);
  block(certificate.courseTitle, 227, 18, display, 4, ink, 14);
  centered(`Completed ${certificate.completedAt.toLocaleDateString("en-JM", { dateStyle: "long", timeZone: "America/Jamaica" })}`, 124, 12);
  block(`Certificate ${certificate.certificateNumber}`, 80, 10, body, 1, muted);
  centered("Verify this certificate on the CH Elevate website.", 61, 9, body, muted);
  return pdf.save();
}
