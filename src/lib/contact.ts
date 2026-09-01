import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  phone: z.string().trim().max(40).optional(),
  company: z.string().trim().max(160).optional(),
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(10).max(5_000),
  consent: z.literal(true),
});

export type ContactInput = z.infer<typeof contactSchema>;
