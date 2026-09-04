import { z } from "zod";

export const bookingMailKinds = ["received", "adminNew", "approved", "rejected", "rescheduled", "cancelled", "completed", "noShow"] as const;
export type BookingMailKind = typeof bookingMailKinds[number];
export const bookingMailLabels: Record<BookingMailKind, string> = {
  received: "Request received", adminNew: "New request to administrator", approved: "Booking approved",
  rejected: "Request declined", rescheduled: "Booking rescheduled", cancelled: "Booking cancelled", completed: "Booking completed", noShow: "Missed appointment",
};
export const bookingMailVariables = ["customerName", "eventTitle", "date", "time", "timeZone", "duration", "bookingId", "status", "company", "phone", "email", "questionnaire"] as const;
export type BookingMailValues = Record<typeof bookingMailVariables[number], string>;
const singleLine = z.string().trim().min(1).max(200).refine((value) => !/[\r\n\x00-\x1f\x7f]/.test(value), "Use a single line without control characters.");
function validVariables(value: string) {
  const stripped = value.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => bookingMailVariables.some((item) => item === name) ? "" : match);
  return !stripped.includes("{{") && !stripped.includes("}}");
}
const templateSchema = z.object({
  enabled: z.boolean(),
  subject: singleLine.refine(validVariables, "Use only supported template variables."),
  text: z.string().trim().min(1).max(10000).refine(validVariables, "Use only supported template variables."),
}).strict();
export const bookingMailSettingsSchema = z.object({
  senderName: singleLine.max(120), senderEmail: z.email().max(254), replyTo: z.email().max(254), adminRecipient: z.email().max(254),
  templates: z.object({ received: templateSchema, adminNew: templateSchema, approved: templateSchema, rejected: templateSchema, rescheduled: templateSchema, cancelled: templateSchema, completed: templateSchema, noShow: templateSchema }).strict(),
}).strict();
export type BookingMailSettings = z.infer<typeof bookingMailSettingsSchema>;
const message = (subject: string, text: string, enabled = true) => ({ subject, text, enabled });
const greeting = "Hello {{customerName}},\n\n";
const appointment = "{{eventTitle}}\n{{date}} at {{time}} ({{timeZone}})\nDuration: {{duration}} minutes\nReference: {{bookingId}}";
const signature = "\n\nCH Elevate Consultancy Limited";
export const defaultBookingMailSettings: BookingMailSettings = {
  senderName: "CH Elevate Consultancy Limited", senderEmail: "info@ch-elevateconsultancy.com", replyTo: "info@ch-elevateconsultancy.com", adminRecipient: "info@ch-elevateconsultancy.com",
  templates: {
    received: message("CH Elevate booking request received", `${greeting}We received your booking request:\n\n${appointment}\n\nAn administrator will review your request and confirm it by email.${signature}`),
    adminNew: message("New booking request: {{eventTitle}}", `Name: {{customerName}}\nEmail: {{email}}\nPhone: {{phone}}\nCompany: {{company}}\n\n${appointment}\n\n{{questionnaire}}`),
    approved: message("Your CH Elevate booking is confirmed", `${greeting}Your booking is confirmed:\n\n${appointment}\n\nReply to this email if you need assistance.${signature}`),
    rejected: message("Update on your CH Elevate booking request", `${greeting}We are unable to accept this booking request:\n\n${appointment}\n\nPlease reply to discuss another time or suitable service.${signature}`),
    rescheduled: message("Your CH Elevate booking time has changed", `${greeting}Your requested appointment time has been updated:\n\n${appointment}\n\nThis revised request is pending administrator confirmation.${signature}`),
    cancelled: message("Your CH Elevate booking is cancelled", `${greeting}This booking has been cancelled:\n\n${appointment}\n\nReply if you would like help arranging another appointment.${signature}`),
    completed: message("Thank you for meeting with CH Elevate", `${greeting}Thank you for attending:\n\n${appointment}${signature}`, false),
    noShow: message("Follow up on your CH Elevate appointment", `${greeting}We missed you at your appointment:\n\n${appointment}\n\nPlease reply if you would like to arrange another time.${signature}`, false),
  },
};
export function renderBookingMail(template: { subject: string; text: string }, values: BookingMailValues) {
  const interpolate = (value: string) => value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: keyof BookingMailValues) => values[name] ?? "");
  return { subject: interpolate(template.subject).replace(/[\r\n\x00-\x1f\x7f]/g, " ").slice(0, 998), text: interpolate(template.text) };
}
export const bookingMailPreviewValues: BookingMailValues = {
  customerName: "Example Client", eventTitle: "Discovery consultation", date: "Monday, 7 September 2026", time: "9:00 am", timeZone: "America/Jamaica", duration: "30", bookingId: "EXAMPLE-REFERENCE", status: "Approved", company: "Example organisation", phone: "+1 876 555 0100", email: "client@example.test", questionnaire: "Your priority: Leadership planning",
};
