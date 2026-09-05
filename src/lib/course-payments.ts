import { canTransitionPayment, type PaymentStatus } from "@/lib/courses";

type RegistrationBalance = {
  id: string;
  status: string;
  paymentStatus: string;
  amountDueCents: number;
  paidCents: number;
  currency: string;
};

export function outstandingByCurrency(registrations: RegistrationBalance[]) {
  const totals = new Map<string, number>();
  for (const registration of new Map(registrations.map((row) => [row.id, row])).values()) {
    if (["cancelled", "rejected"].includes(registration.status) || ["waived", "refunded"].includes(registration.paymentStatus)) continue;
    const balance = Math.max(0, registration.amountDueCents - registration.paidCents);
    if (balance) totals.set(registration.currency, (totals.get(registration.currency) ?? 0) + balance);
  }
  return [...totals].sort(([left], [right]) => left.localeCompare(right)).map(([currency, totalCents]) => ({ currency, totalCents }));
}

type PaymentTransaction = {
  currentStatus: PaymentStatus;
  nextStatus: PaymentStatus;
  amountDueCents: number;
  paidCents: number;
  transactionCents: number;
};

export function applyPaymentTransaction(input: PaymentTransaction): { paidCents: number; transactionCents: number; status: PaymentStatus } {
  if (!canTransitionPayment(input.currentStatus, input.nextStatus)) throw new Error(`Payment cannot move directly from ${input.currentStatus.replaceAll("_", " ")} to ${input.nextStatus.replaceAll("_", " ")}.`);
  if (![input.amountDueCents, input.paidCents, input.transactionCents].every(Number.isSafeInteger) || input.amountDueCents < 0 || input.paidCents < 0 || input.paidCents > input.amountDueCents || input.transactionCents < 0) throw new Error("Payment amounts are invalid.");

  const remaining = input.amountDueCents - input.paidCents;
  if (["unpaid", "invoiced", "waived"].includes(input.nextStatus)) {
    if (input.transactionCents !== 0) throw new Error("This status does not accept a transaction amount.");
    if (input.paidCents !== 0) throw new Error("Recorded receipts must be refunded before applying this status.");
    return { paidCents: input.paidCents, transactionCents: 0, status: input.nextStatus };
  }
  if (input.nextStatus === "refunded") {
    if (input.transactionCents !== input.paidCents || input.transactionCents === 0) throw new Error("A refund must match all recorded receipts.");
    return { paidCents: 0, transactionCents: -input.transactionCents, status: "refunded" };
  }
  if (input.transactionCents <= 0 || input.transactionCents > remaining) throw new Error("Enter a transaction amount no greater than the remaining balance.");
  const paidCents = input.paidCents + input.transactionCents;
  if (input.nextStatus === "paid" && paidCents !== input.amountDueCents) throw new Error("The transaction amount must settle the remaining balance before marking this registration paid.");
  if (input.nextStatus === "partially_paid" && paidCents >= input.amountDueCents) throw new Error("Use paid when the transaction settles the remaining balance.");
  return { paidCents, transactionCents: input.transactionCents, status: input.nextStatus };
}
