import { describe, expect, it } from "vitest";
import { bookingMutationSchema, questionnaireEntries, reservesTime, scheduledInterval } from "./admin-bookings";

describe("booking administration boundaries", () => {
  const identity = { id: "3369d51d-3a88-48f9-a2f4-6f7bb13f18be", updatedAt: "2026-09-03T12:00:00.000Z" };
  it("requires an action, version and valid status without arbitrary columns", () => {
    expect(bookingMutationSchema.safeParse({ action: "status", ...identity, status: "rejected" }).success).toBe(true);
    expect(bookingMutationSchema.safeParse({ ...identity, status: "confirmed" }).success).toBe(false);
    expect(bookingMutationSchema.safeParse({ action: "edit", ...identity, customerName: "Client", customerEmail: "a@example.test", customerPhone: "", company: "", notes: "", assignedStaffProfileId: identity.id }).success).toBe(false);
    expect(bookingMutationSchema.safeParse({ action: "delete", id: identity.id }).success).toBe(false);
  });
  it("rejects invalid calendar dates and unsupported durations", () => {
    const input = { action: "duplicate", ...identity, date: "2093-02-28", time: "09:00", durationMinutes: 45 };
    expect(bookingMutationSchema.safeParse(input).success).toBe(true);
    expect(bookingMutationSchema.safeParse({ ...input, date: "2093-02-30" }).success).toBe(false);
    expect(bookingMutationSchema.safeParse({ ...input, durationMinutes: 15 }).success).toBe(false);
  });
  it("does not reserve cancelled, rejected or deleted appointments", () => {
    expect(reservesTime("pending")).toBe(true);
    expect(reservesTime("confirmed")).toBe(true);
    expect(reservesTime("rejected")).toBe(false);
    expect(reservesTime("cancelled")).toBe(false);
    expect(reservesTime("confirmed", new Date())).toBe(false);
  });
  it("rejects past and nonexistent daylight-saving times", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(scheduledInterval("2026-03-08", "02:30", 30, "America/New_York", now)).toBeNull();
    expect(scheduledInterval("2025-12-31", "09:00", 30, "America/Jamaica", now)).toBeNull();
    const interval = scheduledInterval("2026-09-04", "09:00", 45, "America/Jamaica", now)!;
    expect(interval.startsAt.toISOString()).toBe("2026-09-04T14:00:00.000Z");
    expect(interval.endsAt.toISOString()).toBe("2026-09-04T14:45:00.000Z");
  });
  it("renders stored questionnaire labels and legacy answers without parsing markup", () => {
    expect(questionnaireEntries({ questionLabels: '[{"id":"question_topic","label":"Your priority"}]', question_topic: "Leadership", consent: true })).toEqual([{ label: "Your priority", value: "Leadership" }, { label: "Consent", value: "Yes" }]);
    expect(questionnaireEntries({ questionLabels: "broken", priority: "<script>text</script>" })).toEqual([{ label: "priority", value: "<script>text</script>" }]);
  });
});
