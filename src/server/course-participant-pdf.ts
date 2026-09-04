import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, rgb } from "pdf-lib";
import type { CourseParticipantReportRow } from "@/lib/course-participant-report";

export class ParticipantReportError extends Error {}
const teal = rgb(0, 0.34, 0.32); const ink = rgb(0.08, 0.13, 0.2); const muted = rgb(0.32, 0.38, 0.43);
const widths = [30, 150, 180, 110, 90, 90, 120];
const headings = ["No.", "Participant", "Email", "Offering / date", "Registration", "Attendance", "Organisation"];
let assets: Promise<Buffer[]> | undefined;
const loadAssets = () => assets ??= Promise.all([
  readFile(path.join(process.cwd(), "public/fonts/reports/Manrope-Regular.ttf")),
  readFile(path.join(process.cwd(), "public/fonts/reports/Sora-Regular.ttf")),
  readFile(path.join(process.cwd(), "public/images/ch-elevate-logo.png")),
]).catch((error) => { assets = undefined; throw error; });

export function reportLines(value: string, width: number, font: PDFFont, size: number): string[] {
  const text = value.replace(/\s+/gu, " ").trim();
  if (text.length > 2000) throw new ParticipantReportError("A report field is too long. Review the selected records before exporting.");
  const supported = new Set(font.getCharacterSet());
  if ([...text].some((character) => !supported.has(character.codePointAt(0)!))) throw new ParticipantReportError("A selected field contains characters the report fonts cannot display. No incomplete PDF was generated.");
  const lines: string[] = []; let line = "";
  for (const word of text.split(" ")) {
    if (line && font.widthOfTextAtSize(`${line} ${word}`, size) <= width) { line += ` ${word}`; continue; }
    if (line) { lines.push(line); line = ""; }
    for (const character of word) {
      if (line && font.widthOfTextAtSize(line + character, size) > width) { lines.push(line); line = ""; }
      line += character;
    }
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}

export async function createParticipantPdf(courseTitle: string, rows: CourseParticipantReportRow[], generatedAt = new Date()) {
  if (!rows.length || rows.length > 1000) throw new ParticipantReportError("Select between 1 and 1,000 participants.");
  const [bodyBytes, headingBytes, logoBytes] = await loadAssets();
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  const body = await pdf.embedFont(bodyBytes, { subset: true }); const display = await pdf.embedFont(headingBytes, { subset: true }); const logo = await pdf.embedPng(logoBytes);
  pdf.setTitle("Course participant list"); pdf.setAuthor("CH Elevate Consultancy Limited"); pdf.setSubject(`${rows.length} selected participant records`); pdf.setCreationDate(generatedAt); pdf.setModificationDate(generatedAt);
  const titleLines = reportLines(courseTitle, 770, display, 15);
  const stamp = new Intl.DateTimeFormat("en-JM", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Jamaica" }).format(generatedAt);
  const lineHeight = 12; let page = pdf.addPage([842, 595]); let y = 0;
  function pageHeader() {
    page.drawImage(logo, { x: 36, y: 543, width: 145, height: 145 * logo.height / logo.width });
    page.drawText("CONFIDENTIAL · ADMINISTRATOR COPY", { x: 550, y: 555, size: 9, font: body, color: muted });
    page.drawText("Course participant list", { x: 36, y: 505, size: 24, font: display, color: teal });
    titleLines.forEach((line, index) => page.drawText(line, { x: 36, y: 480 - index * 19, size: 15, font: display, color: ink }));
    y = 455 - (titleLines.length - 1) * 19;
    page.drawText(`${rows.length} selected records · Generated ${stamp} (America/Jamaica)`, { x: 36, y, size: 9, font: body, color: muted });
    y -= 18; page.drawRectangle({ x: 36, y: y - 28, width: 770, height: 28, color: teal });
    let x = 36; headings.forEach((heading, index) => { page.drawText(heading, { x: x + 6, y: y - 18, size: 9, font: body, color: rgb(1, 1, 1) }); x += widths[index]; }); y -= 28;
  }
  pageHeader();
  for (const [index, row] of rows.entries()) {
    let start: string;
    try { start = new Intl.DateTimeFormat("en-JM", { dateStyle: "medium", timeZone: row.timeZone }).format(row.startsAt); }
    catch { throw new ParticipantReportError("An offering has an invalid date or timezone. Review it before exporting."); }
    const values = [String(index + 1), row.name, row.email, `${row.offeringCode} · ${start}`, row.status.replaceAll("_", " "), row.attendance.replaceAll("_", " "), row.organisationName || "Individual"];
    const lines = values.map((value, column) => reportLines(value, widths[column] - 12, body, 9));
    const height = Math.max(...lines.map((value) => value.length)) * lineHeight + 14;
    if (height > y - 52) { page = pdf.addPage([842, 595]); pageHeader(); }
    if (height > y - 52) throw new ParticipantReportError("A selected record is too large for one report row. Review it before exporting.");
    page.drawRectangle({ x: 36, y: y - height, width: 770, height, color: index % 2 ? rgb(0.96, 0.98, 0.97) : rgb(1, 1, 1) });
    let x = 36; lines.forEach((cell, column) => { cell.forEach((line, position) => page.drawText(line, { x: x + 6, y: y - 15 - position * lineHeight, size: 9, font: body, color: ink })); x += widths[column]; });
    y -= height; page.drawLine({ start: { x: 36, y }, end: { x: 806, y }, color: rgb(0.84, 0.88, 0.88), thickness: 0.5 });
  }
  pdf.getPages().forEach((sheet, index) => {
    sheet.drawText("Contains personal information. Share only with authorised course administrators.", { x: 36, y: 29, size: 8, font: body, color: muted });
    sheet.drawText(`Page ${index + 1} of ${pdf.getPageCount()}`, { x: 731, y: 29, size: 8, font: body, color: muted });
  });
  return Buffer.from(await pdf.save());
}
