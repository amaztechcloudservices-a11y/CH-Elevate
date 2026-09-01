import { z } from "zod";

import type { Availability } from "@/lib/cms";

export const bookingRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  phone: z.string().trim().min(7).max(40),
  company: z.string().trim().max(160).optional().default(""),
  service: z.string().trim().min(2).max(160),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  priority: z.string().trim().min(10).max(3000),
  timeline: z.string().trim().min(2).max(120),
  consent: z.literal(true),
});

export type BookingRequest = z.infer<typeof bookingRequestSchema>;

function localPartsAt(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function zonedDateTimeToDate(
  localDate: string,
  localTime: string,
  timeZone: string,
) {
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let result = new Date(desiredUtc);

  // Two passes handle offset changes close to daylight-saving boundaries.
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = localPartsAt(result, timeZone);
    const representedUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    result = new Date(result.getTime() + desiredUtc - representedUtc);
  }

  return result;
}

function minutesToClock(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export type BookingInterval = { startsAt: Date; endsAt: Date };

export function buildAvailableSlots(
  date: string,
  availability: Availability,
  busy: BookingInterval[],
  now = new Date(),
) {
  const firstMinute = 0;
  const lastMinute = 24 * 60;
  const earliestStart = now;
  const slots: { value: string; label: string; startsAt: string }[] = [];

  for (
    let minute = firstMinute;
    minute + availability.slotMinutes <= lastMinute;
    minute += availability.slotMinutes
  ) {
    const value = minutesToClock(minute);
    const startsAt = zonedDateTimeToDate(date, value, availability.timeZone);
    const endsAt = new Date(
      startsAt.getTime() + availability.slotMinutes * 60 * 1000,
    );
    const unavailable =
      startsAt < earliestStart ||
      busy.some(
        (interval) =>
          interval.startsAt < endsAt && interval.endsAt > startsAt,
      );

    if (!unavailable) {
      slots.push({
        value,
        label: new Intl.DateTimeFormat("en-JM", {
          timeZone: availability.timeZone,
          hour: "numeric",
          minute: "2-digit",
        }).format(startsAt),
        startsAt: startsAt.toISOString(),
      });
    }
  }

  return slots;
}
