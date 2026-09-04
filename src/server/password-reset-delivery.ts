import { AsyncLocalStorage } from "node:async_hooks";

import { sendCourseMail } from "@/server/course-mail";

// Better Auth deliberately absorbs mail callback errors for public recovery.
// Keep a request-local delivery acknowledgement for the authenticated admin UI.
const delivery = new AsyncLocalStorage<{ sent: boolean }>();

export async function sendPasswordResetEmail(email: string, url: string) {
  const result = await sendCourseMail({ to: email, subject: "Reset your CH Elevate password", text: `You or a CH Elevate administrator requested a password reset. Use this secure link within 30 minutes:\n${url}\n\nIf you did not request help, you can ignore this email. Your password remains unchanged until you complete the reset.` });
  const current = delivery.getStore();
  if (current) current.sent = result.delivered;
}

export async function withPasswordResetDelivery(operation: () => Promise<unknown>) {
  return delivery.run({ sent: false }, async () => {
    await operation();
    if (!delivery.getStore()?.sent) throw new Error("Password reset email could not be sent.");
  });
}
