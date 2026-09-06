import { sendWebsiteMail } from "@/server/site-mail";

export async function sendCourseMail(input: { to: string; subject: string; text: string }): Promise<{ delivered: boolean; state?: string }> {
  return sendWebsiteMail(input, "course");
}
