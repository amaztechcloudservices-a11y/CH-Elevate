import { z } from "zod";
import { cmsSnapshotSchema, defaultCmsSnapshot } from "@/lib/cms";

export const websiteCmsSchema = cmsSnapshotSchema.omit({ availability: true }).extend({
  forms: cmsSnapshotSchema.shape.forms.refine((forms) => forms.every((form) => form.key !== "booking"), "Booking questionnaires belong in Booking administration.")
    .refine((forms) => new Set(forms.map((form) => form.key)).size === forms.length, "Form keys must be unique."),
}).strict();
export type WebsiteCmsSnapshot = z.infer<typeof websiteCmsSchema>;
export function defaultWebsiteCms(): WebsiteCmsSnapshot {
  const { settings, heroSlides, pages, forms } = structuredClone(defaultCmsSnapshot);
  return { settings, heroSlides, pages, forms: forms.filter((form) => form.key !== "booking") };
}
