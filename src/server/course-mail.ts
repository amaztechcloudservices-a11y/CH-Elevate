import nodemailer from "nodemailer";

export async function sendCourseMail(input: { to: string; subject: string; text: string }) {
  const smtpUrl = process.env.SMTP_URL;
  const from = process.env.CONTACT_FROM;
  if (!smtpUrl || !from) return { delivered: false };
  await nodemailer.createTransport(smtpUrl).sendMail({ from, ...input });
  return { delivered: true };
}
