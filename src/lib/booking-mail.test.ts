import { expect, it } from "vitest";
import { bookingMailSettingsSchema, defaultBookingMailSettings, renderBookingMail, bookingMailPreviewValues } from "./booking-mail";

it("validates default templates and rejects header injection and extra transport fields", () => {
  expect(bookingMailSettingsSchema.safeParse(defaultBookingMailSettings).success).toBe(true);
  expect(bookingMailSettingsSchema.safeParse({ ...defaultBookingMailSettings, senderName: "CH\r\nBcc: other@example.test" }).success).toBe(false);
  expect(bookingMailSettingsSchema.safeParse({ ...defaultBookingMailSettings, senderEmail: "a@example.test,b@example.test" }).success).toBe(false);
  expect(bookingMailSettingsSchema.safeParse({ ...defaultBookingMailSettings, smtpUrl: "smtp://attacker" }).success).toBe(false);
});
it("rejects unsupported, malformed or executable template variables", () => {
  for (const text of ["{{missing}}", "{{customerName", "{{process.env.SMTP_URL}}", "{{customerName.toUpperCase()}}", "{{customerName}} }}"]) {
    expect(bookingMailSettingsSchema.safeParse({ ...defaultBookingMailSettings, templates: { ...defaultBookingMailSettings.templates, approved: { enabled: true, subject: "Approved", text } } }).success).toBe(false);
  }
});
it("interpolates once, preserves literal client text and keeps subject values on one line", () => {
  const result = renderBookingMail({ subject: "Booking: {{ customerName }}", text: "{{customerName}} / {{eventTitle}}" }, { ...bookingMailPreviewValues, customerName: "Hello\r\nBcc: other@example.test", eventTitle: "{{email}} <script>literal text</script>" });
  expect(result.subject).not.toMatch(/[\r\n]/);
  expect(result.text).toContain("{{email}} <script>literal text</script>");
});
