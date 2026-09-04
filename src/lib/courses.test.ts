import { describe, expect, it } from "vitest";
import { formatMoney } from "./courses";

import { canAccessCourseFiles, canMarkCompleted, canTransitionPayment, courseApplicationSchema, decideApprovalStatus, isCertificateEligible, isSubstitutionOpen, orderWaitlist } from "@/lib/courses";

describe("course registration rules", () => {
  it("displays exact monetary cents with an unambiguous currency code", () => {
    for (const currency of ["JMD", "USD", "GBP", "EUR", "CAD"]) {
      expect(formatMoney(12545, currency).replaceAll("\u00a0", " ")).toBe(`${currency} 125.45`);
      expect(formatMoney(1, currency).replaceAll("\u00a0", " ")).toBe(`${currency} 0.01`);
      expect(formatMoney(0, currency).replaceAll("\u00a0", " ")).toBe(`${currency} 0.00`);
    }
  });
  it("waitlists a hard-cap request that would overbook", () => {
    expect(decideApprovalStatus({ capacityMode: "hard", capacity: 20, approvedSeats: 19, requestedSeats: 2 })).toBe("waitlisted");
  });

  it("permits soft-cap and explicit override approvals", () => {
    expect(decideApprovalStatus({ capacityMode: "soft", capacity: 20, approvedSeats: 20, requestedSeats: 2 })).toBe("approved");
    expect(decideApprovalStatus({ capacityMode: "hard", capacity: 20, approvedSeats: 20, requestedSeats: 1, override: true })).toBe("approved");
  });

  it("limits materials and certificates to eligible participants", () => {
    expect(canAccessCourseFiles("approved")).toBe(true);
    expect(canAccessCourseFiles("waitlisted")).toBe(false);
    expect(isCertificateEligible("attended", new Date())).toBe(true);
    expect(isCertificateEligible("no_show", new Date())).toBe(false);
  });

  it("validates and normalizes complete registration applications", () => {
    const result = courseApplicationSchema.parse({ offeringId: "11111111-1111-4111-8111-111111111111", applicantName: "  Student One  ", applicantEmail: "STUDENT@EXAMPLE.COM", participants: [{ name: "Student One", email: "STUDENT@EXAMPLE.COM" }], consent: true });
    expect(result.applicantName).toBe("Student One");
    expect(result.applicantEmail).toBe("student@example.com");
    expect(() => courseApplicationSchema.parse({ ...result, participants: [] })).toThrow();
  });

  it("orders the waitlist by creation time with a deterministic id tie-breaker", () => {
    const time = new Date("2026-08-30T12:00:00Z");
    const ordered = orderWaitlist([{ id: "b", createdAt: time }, { id: "c", createdAt: new Date(time.getTime() + 1) }, { id: "a", createdAt: time }]);
    expect(ordered.map((row) => row.id)).toEqual(["a", "b", "c"]);
  });

  it("enforces substitution cutoffs", () => {
    const now = new Date("2026-08-30T12:00:00Z");
    expect(isSubstitutionOpen(null, now)).toBe(true);
    expect(isSubstitutionOpen(new Date("2026-08-30T12:00:00Z"), now)).toBe(true);
    expect(isSubstitutionOpen(new Date("2026-08-30T11:59:59Z"), now)).toBe(false);
  });

  it("allows valid offline-payment transitions and rejects invalid ones", () => {
    expect(canTransitionPayment("unpaid", "invoiced")).toBe(true);
    expect(canTransitionPayment("invoiced", "partially_paid")).toBe(true);
    expect(canTransitionPayment("partially_paid", "paid")).toBe(true);
    expect(canTransitionPayment("paid", "refunded")).toBe(true);
    expect(canTransitionPayment("refunded", "paid")).toBe(false);
    expect(canTransitionPayment("paid", "invoiced")).toBe(false);
  });

  it("only marks attended participants complete", () => {
    expect(canMarkCompleted("attended")).toBe(true);
    expect(canMarkCompleted("partially_attended")).toBe(false);
    expect(canMarkCompleted("no_show")).toBe(false);
  });
});
