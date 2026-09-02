import nodemailer from "nodemailer";

export const PRIMARY_SITE_EMAIL = "info@ch-elevateconsultancy.com";
export const PRIMARY_SITE_FROM = `CH Elevate Consultancy Limited <${PRIMARY_SITE_EMAIL}>`;

type MailEnvironment = {
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

type WebsiteMail = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
};

export async function sendWebsiteMail(input: WebsiteMail) {
  const { smtpUrl, from } = getSiteMailConfig();
  if (!smtpUrl) return { delivered: false };

  try {
    await nodemailer.createTransport(smtpUrl).sendMail({ from, ...input });
    return { delivered: true };
  } catch (error) {
    console.error("Website email delivery failed", error instanceof Error ? error.message : "Unknown error");
    return { delivered: false };
  }
}

export function sendPrimaryInboxMail(input: Omit<WebsiteMail, "to">) {
  return sendWebsiteMail({ ...input, to: getSiteMailConfig().recipient });
}
