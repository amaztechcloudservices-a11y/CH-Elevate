import { describe, expect, it } from "vitest";

import { applyPaymentTransaction, outstandingByCurrency } from "./course-payments";

describe("course payment accounting", () => {
  it("keeps outstanding balances separated by currency and excludes closed registrations", () => {
    expect(outstandingByCurrency([
      { id: "jmd", status: "approved", paymentStatus: "partially_paid", amountDueCents: 20_000, paidCents: 5_000, currency: "JMD" },
      { id: "usd", status: "approved", paymentStatus: "unpaid", amountDueCents: 10_000, paidCents: 0, currency: "USD" },
      { id: "cancelled", status: "cancelled", paymentStatus: "unpaid", amountDueCents: 99_999, paidCents: 0, currency: "JMD" },
      { id: "waived", status: "approved", paymentStatus: "waived", amountDueCents: 9_999, paidCents: 0, currency: "USD" },
    ])).toEqual([{ currency: "JMD", totalCents: 15_000 }, { currency: "USD", totalCents: 10_000 }]);
  });

  it("records partial and final receipts against the remaining balance", () => {
    expect(applyPaymentTransaction({ currentStatus: "invoiced", nextStatus: "partially_paid", amountDueCents: 25_000, paidCents: 0, transactionCents: 10_000 })).toEqual({ paidCents: 10_000, transactionCents: 10_000, status: "partially_paid" });
    expect(applyPaymentTransaction({ currentStatus: "partially_paid", nextStatus: "paid", amountDueCents: 25_000, paidCents: 10_000, transactionCents: 15_000 })).toEqual({ paidCents: 25_000, transactionCents: 15_000, status: "paid" });
  });

  it("rejects a false paid status and handles a full refund", () => {
    expect(() => applyPaymentTransaction({ currentStatus: "partially_paid", nextStatus: "paid", amountDueCents: 25_000, paidCents: 10_000, transactionCents: 5_000 })).toThrow("remaining balance");
    expect(applyPaymentTransaction({ currentStatus: "paid", nextStatus: "refunded", amountDueCents: 25_000, paidCents: 25_000, transactionCents: 25_000 })).toEqual({ paidCents: 0, transactionCents: -25_000, status: "refunded" });
  });
});
