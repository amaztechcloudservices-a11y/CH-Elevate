import { z } from "zod";
import { imageReferenceSchema } from "@/lib/image-reference";

const bannerSchema = imageReferenceSchema(2000);

export const websitePageOptions = [
  { slug: "home", label: "Home" },
  { slug: "about", label: "About us" },
  { slug: "services", label: "Services" },
  { slug: "portfolio", label: "Success stories" },
  { slug: "programmes", label: "Programmes" },
  { slug: "community", label: "Community" },
  { slug: "faq", label: "FAQ" },
  { slug: "contact", label: "Contact" },
] as const;

const websitePageSlugSchema = z.enum(["home", "about", "services", "portfolio", "programmes", "community", "faq", "contact"]);
export const courseCatalogueSectionSchema = z.object({
  isPublished: z.boolean(),
  pageSlug: websitePageSlugSchema,
  backgroundType: z.enum(["color", "image"]),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Choose a six-digit hexadecimal color."),
  backgroundImageUrl: bannerSchema,
}).strict().superRefine((section, context) => {
  if (section.backgroundType === "image" && !section.backgroundImageUrl) {
    context.addIssue({ code: "custom", path: ["backgroundImageUrl"], message: "Choose a background image before using the image background." });
  }
});
export type CourseCatalogueSectionInput = z.infer<typeof courseCatalogueSectionSchema>;
export type CourseCatalogueSectionRecord = CourseCatalogueSectionInput & { updatedAt: string | null };
export const defaultCourseCatalogueSection: CourseCatalogueSectionInput = {
  isPublished: true,
  pageSlug: "programmes",
  backgroundType: "color",
  backgroundColor: "#f7f7f7",
  backgroundImageUrl: "",
};

export const courseCatalogueSchema = z.object({
  title: z.string().trim().min(3).max(180),
  slug: z.string().trim().min(1).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  subtitle: z.string().trim().max(240),
  summary: z.string().trim().min(10).max(500),
  description: z.string().trim().min(10).max(10000),
  bannerUrl: bannerSchema,
  instructorId: z.uuid().nullable(),
  categoryId: z.uuid().nullable(),
  skillLevel: z.enum(["all_levels", "beginner", "intermediate", "advanced"]),
  status: z.enum(["draft", "published", "archived"]),
  accessType: z.enum(["free", "one_time", "subscription", "private"]),
  priceCents: z.number().int().min(0).max(100000000),
  currency: z.enum(["JMD", "USD", "GBP", "EUR", "CAD"]),
  subscription: z.string().trim().max(300),
  enrollmentLimit: z.number().int().min(1).max(1000000).nullable(),
}).strict().superRefine((course, context) => {
  if (course.accessType === "free" && course.priceCents !== 0) context.addIssue({ code: "custom", path: ["priceCents"], message: "Free courses must have a zero price." });
  if (course.accessType === "subscription" && !course.subscription) context.addIssue({ code: "custom", path: ["subscription"], message: "Describe the subscription terms. No automatic billing is performed." });
  if (course.status === "published") {
    const labels = { subtitle: "Subtitle", bannerUrl: "Banner image", instructorId: "Instructor", categoryId: "Category" };
    for (const field of ["subtitle", "bannerUrl", "instructorId", "categoryId"] as const) {
      if (!course[field]) context.addIssue({ code: "custom", path: [field], message: `${labels[field]} is required before publication.` });
    }
  }
});
export type CourseCatalogueInput = z.infer<typeof courseCatalogueSchema>;
export type CourseCatalogueRecord = CourseCatalogueInput & { id: string; updatedAt: string };
export const emptyCourse: CourseCatalogueInput = {
  title: "", slug: "", subtitle: "", summary: "", description: "", bannerUrl: "", instructorId: null, categoryId: null,
  skillLevel: "all_levels", status: "draft", accessType: "free", priceCents: 0, currency: "JMD", subscription: "", enrollmentLimit: null,
};
