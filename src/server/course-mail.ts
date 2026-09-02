import { sendWebsiteMail } from "@/server/site-mail";

export async function sendCourseMail(input: { to: string; subject: string; text: string }) {
  return sendWebsiteMail(input);
}
