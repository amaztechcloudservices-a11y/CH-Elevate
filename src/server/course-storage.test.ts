import { expect, it } from "vitest";
import { validateCourseFile } from "./course-storage";

const validate = (name: string, type: string, content: string | Buffer) => {
  const bytes = Buffer.from(content);
  return validateCourseFile(new File([bytes], name, { type }), bytes);
};
it("accepts matching PDF and UTF-8 text while rejecting disguised or empty files", () => {
  expect(validate("notes.TXT", "text/plain", "Course notes — welcome")).toBe(".txt");
  expect(validate("notes.pdf", "application/pdf", "%PDF-1.7\n")).toBe(".pdf");
  expect(validate("roster.csv", "text/csv", "name,email\nStudent,student@example.test")).toBe(".csv");
  expect(() => validate("bad.exe", "application/pdf", "%PDF-1.7")).toThrow(/extension/);
  expect(() => validate("bad.pdf", "application/pdf", "not a PDF")).toThrow(/valid PDF/);
  expect(() => validate("bad.txt", "text/plain", Buffer.from([0xff]))).toThrow(/UTF-8/);
  expect(() => validate("bad.txt", "text/plain", "a\0b")).toThrow(/binary/);
  expect(() => validate("empty.txt", "text/plain", "")).toThrow(/1 byte/);
});
it("checks Office container identity and rejects macro-enabled or invalid directories", () => {
  function container(names: string[]) {
    const entries = names.map((name) => { const bytes = Buffer.from(name); const header = Buffer.alloc(46); header.writeUInt32LE(0x02014b50); header.writeUInt16LE(bytes.length, 28); return Buffer.concat([header, bytes]); });
    const directory = Buffer.concat(entries); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(names.length, 10); end.writeUInt32LE(directory.length, 12);
    return Buffer.concat([directory, end]);
  }
  const type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  expect(validate("notes.docx", type, container(["[Content_Types].xml", "word/document.xml"]))).toBe(".docx");
  expect(() => validate("bad.docx", type, Buffer.from("PK"))).toThrow(/valid Office/);
  expect(() => validate("bad.docx", type, container(["[Content_Types].xml", "xl/workbook.xml"]))).toThrow(/match/);
  expect(() => validate("macro.docx", type, container(["[Content_Types].xml", "word/document.xml", "word/vbaProject.bin"]))).toThrow(/Macro/);
});
