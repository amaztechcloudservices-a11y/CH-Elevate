import { expect, it } from "vitest";
import { bookingEventSchema, bookingHorizonEnd, buildEventSlots, newBookingEvent, validateEventAnswers } from "./booking-events";
const now = new Date("2026-09-03T12:00:00Z");
it("uses the event's weekly hours, duration and busy intervals", () => {
  const slots = buildEventSlots("2026-09-04", { ...newBookingEvent, durationMinutes: 45 }, [{ startsAt: new Date("2026-09-04T14:00:00Z"), endsAt: new Date("2026-09-04T15:00:00Z") }], now);
  expect(slots[0].value).toBe("10:30");
  expect(slots.at(-1)?.value).toBe("15:45");
  expect(buildEventSlots("2026-09-05", newBookingEvent, [], now)).toEqual([]);
});
it("applies date closures and custom hours", () => {
  expect(buildEventSlots("2026-09-04", { ...newBookingEvent, dateOverrides: [{ date: "2026-09-04", windows: [] }] }, [], now)).toEqual([]);
  expect(buildEventSlots("2026-09-05", { ...newBookingEvent, dateOverrides: [{ date: "2026-09-05", windows: [{ start: "10:00", end: "11:00" }] }] }, [], now)).toHaveLength(2);
});
it.each(["days", "weeks", "months", "years", "infinite"] as const)("supports the %s horizon", (unit) => {
  const event = { ...newBookingEvent, horizon: { unit, count: 1 } };
  const expected = { days: "2026-09-04", weeks: "2026-09-10", months: "2026-10-03", years: "2027-09-03", infinite: null };
  expect(bookingHorizonEnd(event, now)).toBe(expected[unit]);
});
it("clamps month ends and excludes dates beyond the horizon", () => {
  const event = { ...newBookingEvent, horizon: { unit: "months" as const, count: 1 } };
  expect(bookingHorizonEnd(event, new Date("2026-01-31T12:00:00Z"))).toBe("2026-02-28");
  expect(buildEventSlots("2026-10-05", event, [], now)).toEqual([]);
  expect(buildEventSlots("2026-02-30", event, [], now)).toEqual([]);
});
it("enforces custom required fields and rejects injected answers", () => {
  const event = { ...newBookingEvent, questions: [{ id: "question_topic", label: "Topic", type: "select" as const, required: true, options: ["Leadership"] }] };
  expect(validateEventAnswers(event, { question_topic: "Leadership" }).success).toBe(true);
  expect(validateEventAnswers(event, {}).success).toBe(false);
  expect(validateEventAnswers(event, { question_topic: "Other" }).success).toBe(false);
  expect(validateEventAnswers(event, { question_topic: "Leadership", admin: true }).success).toBe(false);
});
it("requires agent details to publish and restricts durations", () => {
  const draft = { ...newBookingEvent, title: "Discovery", slug: "discovery", description: "An introductory call." };
  expect(bookingEventSchema.safeParse(draft).success).toBe(true);
  expect(bookingEventSchema.safeParse({ ...draft, isPublished: true }).success).toBe(false);
  expect(bookingEventSchema.safeParse({ ...draft, durationMinutes: 15 }).success).toBe(false);
});
it("permits omitted optional answers but enforces types, lengths and event-specific keys", () => {
  const event = { ...newBookingEvent, questions: [
    { id: "question_notes", label: "Notes", type: "textarea" as const, required: false, options: [] },
    { id: "question_contact", label: "Contact", type: "checkbox" as const, required: false, options: [] },
    { id: "question_choice", label: "Choice", type: "select" as const, required: false, options: ["One"] },
  ] };
  expect(validateEventAnswers(event, {}).success).toBe(true);
  expect(validateEventAnswers(event, { question_notes: "", question_contact: false, question_choice: "" }).success).toBe(true);
  expect(validateEventAnswers(event, { question_contact: "false" }).success).toBe(false);
  expect(validateEventAnswers(event, { question_notes: true }).success).toBe(false);
  expect(validateEventAnswers(event, { question_notes: "x".repeat(3001) }).success).toBe(false);
  expect(validateEventAnswers(event, { question_choice: "Other" }).success).toBe(false);
  expect(validateEventAnswers({ ...event, questions: [] }, { question_notes: "Removed question" }).success).toBe(false);
});
it("omits nonexistent daylight-saving times and honors advance notice", () => {
  const event = { ...newBookingEvent, timeZone: "America/New_York", leadTimeHours: 0, horizon: { unit: "infinite" as const, count: 1 }, weekly: newBookingEvent.weekly.map((day) => ({ ...day, enabled: true, windows: [{ start: "01:00", end: "04:00" }] })) };
  const values = buildEventSlots("2027-03-14", event, [], new Date("2027-03-13T12:00:00Z")).map((slot) => slot.value);
  expect(values).not.toContain("02:00"); expect(values).not.toContain("02:30"); expect(values).toContain("03:00");
  expect(buildEventSlots("2026-09-03", { ...newBookingEvent, leadTimeHours: 24 }, [], now)).toEqual([]);
});
it("uses the event's local date, clamps leap years and preserves a multi-month anchor", () => {
  const leapDay = new Date("2028-03-01T02:00:00Z"); // Still February 29 in Jamaica.
  expect(bookingHorizonEnd({ ...newBookingEvent, horizon: { unit: "years", count: 1 } }, leapDay)).toBe("2029-02-28");
  expect(bookingHorizonEnd({ ...newBookingEvent, horizon: { unit: "months", count: 2 } }, new Date("2028-01-31T20:00:00Z"))).toBe("2028-03-31");
  expect(bookingHorizonEnd({ ...newBookingEvent, timeZone: "Pacific/Auckland", horizon: { unit: "days", count: 1 } }, new Date("2026-09-03T20:00:00Z"))).toBe("2026-09-05");
});
it("includes the entire final horizon date but cannot be extended by an override", () => {
  const event = { ...newBookingEvent, leadTimeHours: 0, horizon: { unit: "days" as const, count: 1 }, weekly: newBookingEvent.weekly.map((day) => ({ ...day, enabled: true })), dateOverrides: [{ date: "2026-09-05", windows: [{ start: "09:00", end: "10:00" }] }] };
  expect(buildEventSlots("2026-09-04", event, [], now).at(-1)?.value).toBe("16:30");
  expect(buildEventSlots("2026-09-05", event, [], now)).toEqual([]);
  expect(buildEventSlots("2099-09-04", { ...event, horizon: { unit: "infinite", count: 1 } }, [], now)).toHaveLength(16);
});
it("keeps local weekly hours across daylight-saving changes and checks UTC collisions", () => {
  const event = { ...newBookingEvent, timeZone: "America/New_York", leadTimeHours: 0, horizon: { unit: "infinite" as const, count: 1 }, weekly: newBookingEvent.weekly.map((day) => ({ ...day, enabled: true, windows: [{ start: "09:00", end: "10:00" }] })) };
  const before = buildEventSlots("2027-03-13", event, [], now); const after = buildEventSlots("2027-03-14", event, [], now);
  expect(before[0].startsAt).toBe("2027-03-13T14:00:00.000Z"); expect(after[0].startsAt).toBe("2027-03-14T13:00:00.000Z");
  expect(buildEventSlots("2027-03-14", event, [{ startsAt: new Date("2027-03-14T13:15:00Z"), endsAt: new Date("2027-03-14T13:45:00Z") }], now)).toEqual([]);
  expect(buildEventSlots("2027-11-07", event, [], now)[0].startsAt).toBe("2027-11-07T14:00:00.000Z");
});
