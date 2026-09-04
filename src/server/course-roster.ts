import { participantInputSchema } from "@/lib/courses";

export const maxRosterBytes = 1024 * 1024;
export class CourseRosterError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}

export function parseCourseRoster(source: string) {
  const text = source.replace(/^\uFEFF/, "");
  const records: string[][] = []; let cells: string[] = []; let cell = "";
  let quoted = false; let closedQuote = false;
  function finishCell() { cells.push(cell.trim()); cell = ""; closedQuote = false; }
  function finishRecord() {
    finishCell();
    if (cells.length !== 1 || cells[0] !== "") records.push(cells);
    cells = [];
    if (records.length > 251) throw new CourseRosterError("The CSV must contain between 1 and 250 participants.");
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closedQuote = true; }
      } else cell += char;
      continue;
    }
    if (closedQuote && (char === " " || char === "\t")) continue;
    if (char === ",") { finishCell(); continue; }
    if (char === "\n" || char === "\r") { finishRecord(); if (char === "\r" && text[i + 1] === "\n") i++; continue; }
    if (closedQuote) throw new CourseRosterError("Unexpected text after a quoted CSV field.");
    if (char === '"') {
      if (cell) throw new CourseRosterError("Quotes must surround the entire CSV field.");
      quoted = true;
    } else cell += char;
  }
  if (quoted) throw new CourseRosterError("A quoted CSV field was not closed.");
  if (cell || cells.length || closedQuote) finishRecord();
  const headers = records.shift()?.map((value) => value.toLowerCase()) || [];
  if (!headers.includes("name") || !headers.includes("email") || new Set(headers).size !== headers.length || headers.some((value) => !["name", "email", "phone"].includes(value))) throw new CourseRosterError("CSV headers must be name and email, with an optional phone column; no duplicate or extra columns.");
  if (!records.length) throw new CourseRosterError("The CSV must contain between 1 and 250 participants.");
  const emails = new Set<string>();
  return records.map((record, index) => {
    if (record.length !== headers.length) throw new CourseRosterError(`Participant row ${index + 1} has the wrong number of columns.`);
    if (record.some((value) => /[\u0000-\u001f\u007f]/.test(value))) throw new CourseRosterError(`Participant row ${index + 1} contains unsupported control characters.`);
    const parsed = participantInputSchema.safeParse(Object.fromEntries(headers.map((header, i) => [header, record[i]])));
    if (!parsed.success) throw new CourseRosterError(`Participant row ${index + 1}: ${parsed.error.issues[0]?.message || "review the name, email and phone."}`);
    if (emails.has(parsed.data.email)) throw new CourseRosterError(`Participant row ${index + 1} repeats a duplicate email address.`, 409);
    emails.add(parsed.data.email); return parsed.data;
  });
}
