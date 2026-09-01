import { describe, expect, it } from "vitest";

import { buildAvailableSlots, zonedDateTimeToDate } from "@/lib/booking";
import { defaultCmsSnapshot } from "@/lib/cms";

describe("booking availability", () => {
  it("converts Jamaica local time to the correct UTC instant", () => {
    expect(
      zonedDateTimeToDate(
        "2026-08-03",
        "09:00",
        "America/Jamaica",
      ).toISOString(),
    ).toBe("2026-08-03T14:00:00.000Z");
  });

  it("removes occupied slots", () => {
    const now = new Date("2026-07-29T12:00:00.000Z");
    const slots = buildAvailableSlots(
      "2026-08-03",
      defaultCmsSnapshot.availability,
      [
        {
          startsAt: new Date("2026-08-03T15:00:00.000Z"),
          endsAt: new Date("2026-08-03T16:00:00.000Z"),
        },
      ],
      now,
    );

    expect(slots.map((slot) => slot.value)).toContain("09:00");
    expect(slots.map((slot) => slot.value)).not.toContain("10:00");
  });

  it("offers the full day on every day of the week", () => {
    const slots = buildAvailableSlots(
      "2026-08-02",
      defaultCmsSnapshot.availability,
      [],
      new Date("2026-07-29T12:00:00.000Z"),
    );

    expect(slots).toHaveLength(48);
    expect(slots[0].value).toBe("00:00");
    expect(slots.at(-1)?.value).toBe("23:30");
  });

  it("does not offer times that have already passed", () => {
    const slots = buildAvailableSlots(
      "2026-08-02",
      defaultCmsSnapshot.availability,
      [],
      new Date("2026-08-02T17:15:00.000Z"),
    );

    expect(slots.map((slot) => slot.value)).not.toContain("12:00");
    expect(slots.map((slot) => slot.value)).toContain("12:30");
  });
});
