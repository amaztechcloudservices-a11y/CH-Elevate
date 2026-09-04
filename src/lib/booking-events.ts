import { z } from "zod";
import { zonedDateTimeToDate, type BookingInterval } from "@/lib/booking";
import { imageReferenceSchema } from "@/lib/image-reference";

export const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Enter a valid calendar date.");
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const windowSchema = z.object({ start: clock, end: clock }).refine((value) => value.start < value.end, "End time must be after start time.");
export const questionSchema = z.object({
  id: z.string().regex(/^question_[a-z0-9_]{1,60}$/),
  label: z.string().trim().min(1).max(160),
  type: z.enum(["text", "textarea", "select", "checkbox"]),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(120)).max(30),
}).refine((value) => value.type !== "select" || value.options.length > 0, "A choice question needs options.");

export const bookingEventSchema = z.object({
  title: z.string().trim().min(2).max(160),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160),
  subtitle: z.string().trim().max(240),
  description: z.string().trim().min(10).max(4000),
  agentName: z.string().trim().max(120),
  agentPhoto: imageReferenceSchema(600),
  durationMinutes: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90)]),
  timeZone: z.string().max(100).refine((value) => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Choose a valid time zone."),
  leadTimeHours: z.number().int().min(0).max(720),
  horizon: z.object({ unit: z.enum(["days", "weeks", "months", "years", "infinite"]), count: z.number().int().min(1).max(1000) }),
  weekly: z.array(z.object({ day: z.number().int().min(0).max(6), enabled: z.boolean(), windows: z.array(windowSchema).max(8) })).length(7),
  dateOverrides: z.array(z.object({ date: calendarDateSchema, windows: z.array(windowSchema).max(8) })).max(366),
  questions: z.array(questionSchema).max(30),
  isPublished: z.boolean(),
}).superRefine((event, ctx) => {
  for (const [key, values] of [["weekly", event.weekly.map((day) => day.day)], ["dateOverrides", event.dateOverrides.map((day) => day.date)], ["questions", event.questions.map((field) => field.id)]] as const) {
    if (new Set<string | number>(values).size !== values.length) ctx.addIssue({ code: "custom", path: [key], message: "Duplicate entries are not allowed." });
  }
  if (event.isPublished && (!event.agentName || !event.agentPhoto)) ctx.addIssue({ code: "custom", path: ["agentName"], message: "Assign an agent name and photo before publishing." });
});
export type BookingEventDefinition = z.infer<typeof bookingEventSchema>;
export const bookingEventRequestSchema = z.object({
  eventId: z.uuid(), name: z.string().trim().min(2).max(120), email: z.email().max(254),
  phone: z.string().trim().min(7).max(40), company: z.string().trim().max(160).default(""),
  date: calendarDateSchema, time: clock, consent: z.literal(true),
  answers: z.record(z.string().max(80), z.union([z.string().max(3000), z.boolean()])).refine((answers) => Object.keys(answers).length <= 30).default({}),
});
export type BookingEvent = { id: string; data: BookingEventDefinition; updatedAt: string };
export const newBookingEvent: BookingEventDefinition = {
  title: "", slug: "", subtitle: "", description: "", agentName: "", agentPhoto: "", durationMinutes: 30,
  timeZone: "America/Jamaica", leadTimeHours: 24, horizon: { unit: "months", count: 3 },
  weekly: Array.from({ length: 7 }, (_, day) => ({ day, enabled: day > 0 && day < 6, windows: [{ start: "09:00", end: "17:00" }] })),
  dateOverrides: [], questions: [], isPublished: false,
};
export function dateInZone(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function bookingHorizonEnd(event: BookingEventDefinition, now = new Date()) {
  if (event.horizon.unit === "infinite") return null;
  const date = new Date(`${dateInZone(now, event.timeZone)}T12:00:00Z`);
  const { unit, count } = event.horizon;
  if (unit === "days" || unit === "weeks") date.setUTCDate(date.getUTCDate() + count * (unit === "weeks" ? 7 : 1));
  else {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + count * (unit === "years" ? 12 : 1));
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  }
  return date.toISOString().slice(0, 10);
}
export function buildEventSlots(date: string, event: BookingEventDefinition, busy: BookingInterval[], now = new Date()) {
  if (!calendarDateSchema.safeParse(date).success) return [];
  const end = bookingHorizonEnd(event, now);
  if (date < dateInZone(now, event.timeZone) || (end && date > end)) return [];
  const override = event.dateOverrides.find((item) => item.date === date);
  const weekday = event.weekly.find((item) => item.day === new Date(`${date}T12:00:00Z`).getUTCDay());
  const windows = override ? override.windows : weekday?.enabled ? weekday.windows : [];
  const slots = new Map<string, { value: string; label: string; startsAt: string }>();
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  for (const window of windows) {
    for (let minute = minutes(window.start); minute + event.durationMinutes <= minutes(window.end); minute += event.durationMinutes) {
      const value = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      const startsAt = zonedDateTimeToDate(date, value, event.timeZone);
      const endsAt = new Date(startsAt.getTime() + event.durationMinutes * 60_000);
      const actualClock = new Intl.DateTimeFormat("en-GB", { timeZone: event.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(startsAt);
      if (actualClock !== value || startsAt.getTime() < now.getTime() + event.leadTimeHours * 3_600_000) continue;
      if (endsAt > zonedDateTimeToDate(date, window.end, event.timeZone) || busy.some((item) => item.startsAt < endsAt && item.endsAt > startsAt)) continue;
      slots.set(value, { value, label: new Intl.DateTimeFormat("en-JM", { timeZone: event.timeZone, hour: "numeric", minute: "2-digit" }).format(startsAt), startsAt: startsAt.toISOString() });
    }
  }
  return [...slots.values()].sort((a, b) => a.value.localeCompare(b.value));
}
export function validateEventAnswers(event: BookingEventDefinition, answers: Record<string, string | boolean>) {
  const fields: Record<string, z.ZodType> = {};
  for (const field of event.questions) {
    const textAnswer = z.string().trim().max(3000).refine((value) => !field.required || value.length > 0, `${field.label} is required.`)
      .refine((value) => !value || field.type !== "select" || field.options.includes(value), `Choose a valid ${field.label}.`);
    fields[field.id] = field.type === "checkbox" ? (field.required ? z.literal(true) : z.boolean().optional())
      : field.required ? textAnswer : textAnswer.optional();
  }
  return z.object(fields).strict().safeParse(answers);
}
