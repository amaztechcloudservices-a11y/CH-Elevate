import { expect, it } from "vitest";
import { parseCourseRoster } from "./course-roster";

it("parses quoted names, escaped quotes, BOM, CRLF and reordered optional columns", () => {
  expect(parseCourseRoster('\uFEFFEMAIL,Name,phone\r\n  ARVETTE@example.test  ,"Henry, Arvette",+18761234567\r\nsecond@example.test,"Jane ""JJ"" Smith",\r\n')).toEqual([
    { name: "Henry, Arvette", email: "arvette@example.test", phone: "+18761234567" },
    { name: 'Jane "JJ" Smith', email: "second@example.test", phone: "" },
  ]);
  expect(parseCourseRoster("name,email\nStudent Example,student@example.test\n\n")).toEqual([{ name: "Student Example", email: "student@example.test", phone: "" }]);
});
it("rejects missing or malformed rows instead of silently dropping or truncating them", () => {
  for (const input of [
    "name,email\nIncomplete,", "name,email\n,student@example.test", "name,email\nStudent Example,not-email",
    "name,email\nStudent Example,student@example.test,extra", "name,email\nOnly a name",
    'name,email\n"Unclosed,student@example.test', 'name,email\n"Student"suffix,student@example.test',
    'name,email\nStu"dent,student@example.test', 'name,email\n"Student\nExample",student@example.test',
    "name,email,email\nStudent Example,a@example.test,b@example.test", "name,email,role\nStudent Example,a@example.test,admin",
    "name\nStudent Example", "name,email\n", "name,email\nStudent\u0000 Example,a@example.test",
    `name,email\n${"A".repeat(121)},a@example.test`, `name,email,phone\nStudent Example,a@example.test,${"1".repeat(41)}`,
  ]) expect(() => parseCourseRoster(input)).toThrow();
});
it("normalizes duplicate addresses and enforces the 250 participant limit", () => {
  expect(() => parseCourseRoster("name,email\nFirst Student,STUDENT@example.test\nSecond Student,student@example.test")).toThrow(/duplicate/i);
  const text = (count: number) => "name,email\n" + Array.from({ length: count }, (_, i) => `Student ${i},student${i}@example.test`).join("\n");
  expect(parseCourseRoster(text(250))).toHaveLength(250);
  expect(() => parseCourseRoster(text(251))).toThrow(/250/);
});
