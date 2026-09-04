export function isValidProfileTimeZone(value: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}
export type StudentProfileData = {
  user: { name: string; email: string; phone: string | null; jobTitle: string | null; country: string | null; timeZone: string };
  memberships: { organisationName: string; role: string }[];
  registrations: { participant: { id: string; email: string; status: string; attendance: string }; registration: { id: string; paymentStatus: string; amountDueCents: number }; course: { id: string; title: string }; offering: { id: string; code: string; startsAt: string; endsAt: string; timeZone: string; venue: string | null; currency: string; isCancelled: boolean; joiningInstructions: string | null } }[];
  posts: { id: string; title: string; body: string; updatedAt: string }[];
  materials: { id: string; courseId: string | null; title: string; originalFilename: string; sizeBytes: number; version: number }[];
  invoices: { id: string; registrationId: string; documentType: string; reference: string; amountCents: number; dueAt: string | null }[];
  certificates: { id: string; certificateNumber: string; courseTitle: string; issuedAt: string }[];
};
