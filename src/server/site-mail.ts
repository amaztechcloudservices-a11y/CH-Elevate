import nodemailer from "nodemailer";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { operationalMailDeliveries } from "@/db/schema";
import { getDb } from "@/server/db";

export const PRIMARY_SITE_EMAIL = "info@ch-elevateconsultancy.com";
export const PRIMARY_SITE_FROM = `CH Elevate Consultancy Limited <${PRIMARY_SITE_EMAIL}>`;

export type MailEnvironment = {
  SMTP_URL?: string;
  CONTACT_FROM?: string;
  CONTACT_TO?: string;
};

export function getSiteMailConfig(environment: MailEnvironment = {
  SMTP_URL: process.env.SMTP_URL,
  CONTACT_FROM: process.env.CONTACT_FROM,
  CONTACT_TO: process.env.CONTACT_TO,
}) {
  return {
    smtpUrl: environment.SMTP_URL?.trim() || "",
    from: environment.CONTACT_FROM?.trim() || PRIMARY_SITE_FROM,
    recipient: environment.CONTACT_TO?.trim() || PRIMARY_SITE_EMAIL,
  };
}

export async function checkSiteMailConnection(environment?: MailEnvironment, timeoutMs = 5_000) {
  const { smtpUrl } = environment ? getSiteMailConfig(environment) : getSiteMailConfig();
  if (!smtpUrl) return { configured: false, reachable: false, reason: "SMTP is not configured." };

  let config: URL;
  try {
    config = new URL(smtpUrl);
    if (!["smtp:", "smtps:"].includes(config.protocol)) throw new Error("Unsupported SMTP protocol.");
  } catch {
    return { configured: true, reachable: false, reason: "SMTP configuration is invalid." };
  }

  for (const [key, value] of Object.entries({ connectionTimeout: timeoutMs, greetingTimeout: timeoutMs, socketTimeout: timeoutMs })) {
    config.searchParams.set(key, String(value));
  }
  const transport = nodemailer.createTransport(config.toString());
  try {
    await transport.verify();
    return { configured: true, reachable: true, reason: "SMTP connection and authentication succeeded." };
  } catch (error) {
    const code = (error as { code?: string }).code;
    return {
      configured: true,
      reachable: false,
      reason: code === "EAUTH" ? "SMTP authentication failed." : "SMTP endpoint could not be reached.",
    };
  } finally {
    transport.close();
  }
}

type WebsiteMail = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
};

export async function deliverOperationalMail(id: string, confirmUnknown = false) {
  const { smtpUrl, from } = getSiteMailConfig();
  const database = getDb();
  const claimed = await database.transaction(async (tx) => {
    const [row] = await tx.select().from(operationalMailDeliveries).where(eq(operationalMailDeliveries.id, id)).for("update");
    if (!row) return null;
    if (row.state === "accepted") return { row, skip: true };
    const stale = row.state === "sending" && Date.now() - row.updatedAt.getTime() > 120_000;
    if (row.state === "sending" && !stale) return { row, skip: true };
    if ((stale || row.state === "unknown") && !confirmUnknown) {
      const [unknown] = await tx.update(operationalMailDeliveries).set({ state: "unknown", errorCode: "DELIVERY_UNCERTAIN", updatedAt: new Date() }).where(eq(operationalMailDeliveries.id, id)).returning();
      return { row: unknown, skip: true };
    }
    const [sending] = await tx.update(operationalMailDeliveries).set({ state: "sending", attempts: row.attempts + 1, errorCode: null, updatedAt: new Date() }).where(eq(operationalMailDeliveries.id, id)).returning();
    return { row: sending, skip: false };
  });
  if (!claimed) return { delivered: false, state: "failed" as const };
  if (claimed.skip) return { delivered: claimed.row.state === "accepted", state: claimed.row.state };
  let state: "accepted" | "failed" | "unknown" = "failed", errorCode: string | null = null;

  try {
    if (!smtpUrl) throw Object.assign(new Error("SMTP is not configured."), { code: "SMTP_NOT_CONFIGURED" });
    const config = new URL(smtpUrl);
    if (!["smtp:", "smtps:"].includes(config.protocol)) throw Object.assign(new Error("SMTP protocol is invalid."), { code: "SMTP_CONFIGURATION" });
    for (const [key, value] of Object.entries({ connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 })) config.searchParams.set(key, String(value));
    const transport = nodemailer.createTransport(config.toString());
    try {
      const sent = await transport.sendMail({ from, to: claimed.row.recipient, subject: claimed.row.subject, text: claimed.row.body, replyTo: claimed.row.replyTo || undefined, messageId: `<operational-${id}@ch-elevateconsultancy.com>`, disableFileAccess: true, disableUrlAccess: true });
      state = sent.accepted?.length ? "accepted" : "failed";
      if (state === "failed") errorCode = "RECIPIENT_REJECTED";
    } finally { transport.close(); }
  } catch (error) {
    const code = (error as { code?: string }).code;
    state = code === "EAUTH" || code === "EENVELOPE" || code === "SMTP_NOT_CONFIGURED" || code === "SMTP_CONFIGURATION" ? "failed" : "unknown";
    errorCode = state === "unknown" ? "DELIVERY_UNCERTAIN" : code || "DELIVERY_FAILED";
  }
  const delayMinutes = Math.min(360, 2 ** Math.min(claimed.row.attempts, 8));
  await database.update(operationalMailDeliveries).set({ state, errorCode, availableAt: new Date(Date.now() + delayMinutes * 60_000), updatedAt: new Date() }).where(eq(operationalMailDeliveries.id, id));
  return { delivered: state === "accepted", state };
}

export async function sendWebsiteMail(input: WebsiteMail, channel: "website" | "course" = "website") {
  try {
    const [queued] = await getDb().insert(operationalMailDeliveries).values({ channel, recipient: input.to, replyTo: input.replyTo || null, subject: input.subject, body: input.text }).returning({ id: operationalMailDeliveries.id });
    return await deliverOperationalMail(queued.id);
  } catch (error) {
    console.error("Website email queue failed", error instanceof Error ? error.message : "Unknown error");
    return { delivered: false, state: "failed" as const };
  }
}

export async function processOperationalMail(limit = 25) {
  const rows = await getDb().select({ id: operationalMailDeliveries.id }).from(operationalMailDeliveries).where(and(inArray(operationalMailDeliveries.state, ["pending", "failed"]), lt(operationalMailDeliveries.availableAt, new Date()), lt(operationalMailDeliveries.attempts, 8))).orderBy(asc(operationalMailDeliveries.availableAt)).limit(limit);
  return Promise.all(rows.map((row) => deliverOperationalMail(row.id)));
}

export function sendPrimaryInboxMail(input: Omit<WebsiteMail, "to">) {
  return sendWebsiteMail({ ...input, to: getSiteMailConfig().recipient });
}
