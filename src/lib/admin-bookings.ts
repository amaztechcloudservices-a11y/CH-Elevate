import { z } from "zod";
import { calendarDateSchema, dateInZone } from "@/lib/booking-events";
import { zonedDateTimeToDate } from "@/lib/booking";

export const bookingStatuses = ["pending", "confirmed", "rejected", "cancelled", "completed", "no_show"] as const;
export type BookingStatus = typeof bookingStatuses[number];
export const bookingStatusLabels: Record<BookingStatus, string> = {
  pending: "Pending", confirmed: "Approved", rejected: "Rejected", cancelled: "Cancelled", completed: "Completed", no_show: "No show",
};
const identity = { id: z.uuid(), updatedAt: z.iso.datetime(), notifyCustomer: z.boolean().default(false) };
const schedule = {
  date: calendarDateSchema,
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90)]),
};
export const bookingMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), ...identity, status: z.enum(bookingStatuses) }).strict(),
  z.object({ action: z.literal("edit"), ...identity, customerName: z.string().trim().min(2).max(120), customerEmail: z.email().max(254), customerPhone: z.string().trim().max(40), company: z.string().trim().max(160), notes: z.string().trim().max(4000) }).strict(),
  z.object({ action: z.literal("reschedule"), ...identity, ...schedule }).strict(),
  z.object({ action: z.literal("duplicate"), ...identity, ...schedule }).strict(),
  z.object({ action: z.literal("delete"), ...identity }).strict(),
  z.object({ action: z.literal("restore"), ...identity }).strict(),
]);
export function reservesTime(status: BookingStatus, deletedAt: unknown = null) {
  return !deletedAt && status !== "cancelled" && status !== "rejected";
}
export function scheduledInterval(date: string, time: string, durationMinutes: number, timeZone: string, now = new Date()) {
  const startsAt = zonedDateTimeToDate(date, time, timeZone);
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(startsAt);
  if (dateInZone(startsAt, timeZone) !== date || clock !== time || startsAt <= now) return null;
  return { startsAt, endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000) };
}
export type AdminBooking = {
  id: string; bookingEventId: string | null; service: string;
  customerName: string; customerEmail: string; customerPhone: string | null; company: string | null;
  startsAt: string; endsAt: string; timeZone: string; status: BookingStatus;
  notes: string | null; questionnaire: Record<string, string | string[] | boolean>;
  updatedAt: string; deletedAt: string | null;
};
export function questionnaireEntries(answers: AdminBooking["questionnaire"]) {
  let labels: { id: string; label: string }[] = [];
  try {
    const parsed: unknown = JSON.parse(String(answers.questionLabels || "[]"));
    if (Array.isArray(parsed)) labels = parsed.filter((item) => item && typeof item.id === "string" && typeof item.label === "string");
  } catch { /* Legacy responses did not store labels. */ }
  return Object.entries(answers).filter(([key]) => key !== "questionLabels").map(([key, value]) => ({
    label: labels.find((item) => item.id === key)?.label || (key === "agentName" ? "Assigned agent" : key === "consent" ? "Consent" : key),
    value: typeof value === "boolean" ? value ? "Yes" : "No" : Array.isArray(value) ? value.join(", ") : value,
  }));
}
