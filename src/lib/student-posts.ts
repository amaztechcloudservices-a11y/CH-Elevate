import { z } from "zod";
export const studentPostFields = z.object({ title: z.string().trim().min(2).max(180), body: z.string().trim().min(2).max(10000), isPublished: z.boolean() }).strict();
export const studentPostMutation = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), profileId: z.uuid(), data: studentPostFields }).strict(),
  z.object({ action: z.literal("update"), profileId: z.uuid(), id: z.uuid(), updatedAt: z.iso.datetime(), data: studentPostFields }).strict(),
  z.object({ action: z.literal("delete"), profileId: z.uuid(), id: z.uuid(), updatedAt: z.iso.datetime() }).strict(),
]);
export type StudentPost = { id: string; title: string; body: string; isPublished: boolean; createdAt: string; updatedAt: string };
export type StudentSummary = { id: string; name: string; email: string };
