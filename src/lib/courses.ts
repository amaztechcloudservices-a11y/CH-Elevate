import { z } from "zod";

export const participantInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  phone: z.string().trim().max(40).optional().default(""),
});

export const courseApplicationSchema = z.object({
  offeringId: z.uuid(),
  applicantName: z.string().trim().min(2).max(120),
  applicantEmail: z.email().max(254).transform((value) => value.trim().toLowerCase()),
  applicantPhone: z.string().trim().max(40).optional().default(""),
  organisationName: z.string().trim().max(180).optional().default(""),
  participants: z.array(participantInputSchema).min(1).max(100),
  consent: z.literal(true),
});

export type CapacityMode = "unlimited" | "soft" | "hard";
export type RegistrationStatus = "pending_review" | "approved" | "waitlisted" | "rejected" | "cancelled" | "completed";
export type PaymentStatus = "unpaid" | "invoiced" | "partially_paid" | "paid" | "waived" | "refunded";

export function decideApprovalStatus(input: {
  capacityMode: CapacityMode;
  capacity: number | null;
  approvedSeats: number;
  requestedSeats: number;
  override?: boolean;
}): RegistrationStatus {
  if (input.capacityMode === "unlimited" || input.override) return "approved";
  if (input.capacity === null) return "approved";
  if (input.approvedSeats + input.requestedSeats <= input.capacity) return "approved";
  return input.capacityMode === "hard" ? "waitlisted" : "approved";
}

export function canAccessCourseFiles(status: RegistrationStatus) {
  return status === "approved" || status === "completed";
}

export function isCertificateEligible(attendance: string, completedAt: Date | null) {
  return attendance === "attended" && completedAt instanceof Date;
}

export function isSubstitutionOpen(cutoffAt: Date | null, now = new Date()) {
  return cutoffAt === null || cutoffAt >= now;
}

export function canMarkCompleted(attendance: string) {
  return attendance === "attended";
}

const paymentTransitions: Record<PaymentStatus, PaymentStatus[]> = {
  unpaid: ["invoiced", "partially_paid", "paid", "waived"],
  invoiced: ["unpaid", "partially_paid", "paid", "waived"],
  partially_paid: ["invoiced", "paid", "waived", "refunded"],
  paid: ["refunded"],
  waived: ["unpaid"],
  refunded: ["unpaid"],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus) {
  return from === to || paymentTransitions[from].includes(to);
}

export function orderWaitlist<T extends { createdAt: Date; id: string }>(registrations: T[]) {
  return [...registrations].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id));
}

export function formatMoney(cents: number, currency = "JMD") {
  return new Intl.NumberFormat("en-JM", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}
