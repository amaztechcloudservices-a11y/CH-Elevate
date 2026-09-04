import { expect, it } from "vitest";
import {
  courseCatalogueSchema,
  courseCatalogueSectionSchema,
  defaultCourseCatalogueSection,
  emptyCourse,
  websitePageOptions,
} from "./course-catalogue";
const draft = { ...emptyCourse, title: "Delivery leadership", slug: "delivery-leadership", summary: "Practical delivery skills.", description: "A practical course for delivery leaders." };
it("permits private drafts but requires complete published card identity", () => {
  expect(courseCatalogueSchema.safeParse(draft).success).toBe(true);
  expect(courseCatalogueSchema.safeParse({ ...draft, status: "published" }).success).toBe(false);
});
it("rejects unsupported image schemes, traversal, payment fields and quizzes", () => {
  for (const bannerUrl of ["javascript:alert(1)", "data:image/svg+xml,test", "//untrusted.example/a.png", "/images/../private/a.png"]) expect(courseCatalogueSchema.safeParse({ ...draft, bannerUrl }).success).toBe(false);
  expect(courseCatalogueSchema.safeParse({ ...draft, paymentGateway: "stripe" }).success).toBe(false);
  expect(courseCatalogueSchema.safeParse({ ...draft, quizzes: [] }).success).toBe(false);
});
it("validates subscription metadata, money and unlimited enrolment", () => {
  expect(courseCatalogueSchema.safeParse({ ...draft, accessType: "subscription", subscription: "Annual access; arranged offline", priceCents: 10000 }).success).toBe(true);
  expect(courseCatalogueSchema.safeParse({ ...draft, accessType: "subscription" }).success).toBe(false);
  expect(courseCatalogueSchema.safeParse({ ...draft, priceCents: 1 }).success).toBe(false);
  expect(courseCatalogueSchema.safeParse({ ...draft, enrollmentLimit: 0 }).success).toBe(false);
});
it("validates skill levels, publication states and bounded enrolment limits", () => {
  for (const skillLevel of ["all_levels", "beginner", "intermediate", "advanced"]) expect(courseCatalogueSchema.safeParse({ ...draft, skillLevel, enrollmentLimit: 10 }).success).toBe(true);
  for (const data of [{ skillLevel: "expert" }, { status: "live" }, { enrollmentLimit: -1 }, { enrollmentLimit: 1.5 }, { enrollmentLimit: 1000001 }]) expect(courseCatalogueSchema.safeParse({ ...draft, ...data }).success).toBe(false);
  expect(courseCatalogueSchema.safeParse({ ...draft, enrollmentLimit: null, status: "archived" }).success).toBe(true);
});

it("validates the publishable catalogue section for every supported website page", () => {
  expect(websitePageOptions.map((page) => page.slug)).toEqual([
    "home", "about", "services", "portfolio", "programmes", "community", "faq", "contact",
  ]);
  for (const page of websitePageOptions) {
    expect(courseCatalogueSectionSchema.safeParse({ ...defaultCourseCatalogueSection, pageSlug: page.slug }).success).toBe(true);
  }
  expect(courseCatalogueSectionSchema.safeParse({ ...defaultCourseCatalogueSection, pageSlug: "admin" }).success).toBe(false);
});

it("requires a safe image only when the catalogue section uses an image background", () => {
  expect(courseCatalogueSectionSchema.safeParse({ ...defaultCourseCatalogueSection, backgroundType: "color", backgroundColor: "#004945" }).success).toBe(true);
  expect(courseCatalogueSectionSchema.safeParse({ ...defaultCourseCatalogueSection, backgroundType: "image", backgroundImageUrl: "" }).success).toBe(false);
  expect(courseCatalogueSectionSchema.safeParse({ ...defaultCourseCatalogueSection, backgroundType: "image", backgroundImageUrl: "/images/home-hero-background-4.png" }).success).toBe(true);
  expect(courseCatalogueSectionSchema.safeParse({ ...defaultCourseCatalogueSection, backgroundType: "image", backgroundImageUrl: "javascript:alert(1)" }).success).toBe(false);
  expect(courseCatalogueSectionSchema.safeParse({ ...defaultCourseCatalogueSection, backgroundColor: "teal" }).success).toBe(false);
});
