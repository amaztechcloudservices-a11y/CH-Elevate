import { z } from "zod";

export const navigationItemSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().trim().min(1).max(80),
  href: z.string().trim().min(1).max(300),
  isVisible: z.boolean().default(true),
  newTab: z.boolean().default(false),
});

export const globalSettingsSchema = z.object({
  brandName: z.string().trim().min(1).max(80),
  brandTagline: z.string().trim().max(120),
  headerCtaLabel: z.string().trim().min(1).max(80),
  headerCtaHref: z.string().trim().min(1).max(300),
  footerSummary: z.string().trim().max(500),
  footerAddress: z.string().trim().max(300),
  footerEmail: z.email().max(254),
  footerPhone: z.string().trim().max(40),
  mapEmbedUrl: z.string().trim().max(1000),
  mapDirectionsUrl: z.string().trim().max(1000),
  socialLinks: z.array(navigationItemSchema).max(10),
  footerCompanyLinks: z.array(navigationItemSchema).max(12),
  copyright: z.string().trim().max(180),
  navigation: z.array(navigationItemSchema).min(1).max(12),
});

export const heroSlideSchema = z.object({
  id: z.string().min(1).max(80),
  pageSlug: z.string().trim().min(1).max(80),
  eyebrow: z.string().trim().max(100).default(""),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(500),
  imageUrl: z.string().trim().min(1).max(500),
  primaryCtaLabel: z.string().trim().max(80).default(""),
  primaryCtaHref: z.string().trim().max(300).default(""),
  sortOrder: z.number().int().min(0).max(1000),
  isActive: z.boolean().default(true),
});

export const contentItemSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().trim().max(180),
  text: z.string().trim().max(1000),
  imageUrl: z.string().trim().max(500).default(""),
  href: z.string().trim().max(300).default(""),
});

export const pageSectionSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum([
    "intro",
    "features",
    "services",
    "projects",
    "statistics",
    "testimonial",
    "call_to_action",
    "rich_text",
  ]),
  eyebrow: z.string().trim().max(100).default(""),
  heading: z.string().trim().max(220).default(""),
  body: z.string().trim().max(5000).default(""),
  imageUrl: z.string().trim().max(500).default(""),
  ctaLabel: z.string().trim().max(80).default(""),
  ctaHref: z.string().trim().max(300).default(""),
  items: z.array(contentItemSchema).max(24).default([]),
  isVisible: z.boolean().default(true),
});

export const pageContentSchema = z.object({
  slug: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(180),
  seoDescription: z.string().trim().max(320),
  sections: z.array(pageSectionSchema).max(30),
  isPublished: z.boolean().default(true),
});

export const formFieldSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/),
  label: z.string().trim().min(1).max(120),
  type: z.enum([
    "text",
    "email",
    "tel",
    "textarea",
    "select",
    "radio",
    "checkbox",
    "date",
    "time",
  ]),
  placeholder: z.string().trim().max(180).default(""),
  helpText: z.string().trim().max(300).default(""),
  isRequired: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
});

export const formDefinitionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_-]*$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500),
  submitLabel: z.string().trim().min(1).max(80),
  successMessage: z.string().trim().min(1).max(300),
  fields: z.array(formFieldSchema).min(1).max(40),
  isActive: z.boolean().default(true),
});

export const availabilityDaySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  isActive: z.boolean(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export const availabilitySchema = z.object({
  timeZone: z.string().trim().min(1).max(100),
  slotMinutes: z.number().int().min(15).max(240),
  leadTimeHours: z.number().int().min(0).max(720),
  days: z.array(availabilityDaySchema).length(7),
  blockedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366),
});

export const cmsSnapshotSchema = z.object({
  settings: globalSettingsSchema,
  heroSlides: z.array(heroSlideSchema).max(60),
  pages: z.array(pageContentSchema).max(60),
  forms: z.array(formDefinitionSchema).max(30),
  availability: availabilitySchema,
});

export type CmsSnapshot = z.infer<typeof cmsSnapshotSchema>;
export type GlobalSettings = z.infer<typeof globalSettingsSchema>;
export type HeroSlide = z.infer<typeof heroSlideSchema>;
export type PageContent = z.infer<typeof pageContentSchema>;
export type FormDefinition = z.infer<typeof formDefinitionSchema>;
export type FormFieldDefinition = z.infer<typeof formFieldSchema>;
export type Availability = z.infer<typeof availabilitySchema>;

const sharedNavigation: GlobalSettings["navigation"] = [
  { id: "home", label: "Home", href: "/", isVisible: true, newTab: false },
  { id: "about", label: "About us", href: "/about", isVisible: true, newTab: false },
  { id: "services", label: "Services", href: "/services", isVisible: true, newTab: false },
  { id: "portfolio", label: "Success stories", href: "/portfolio", isVisible: true, newTab: false },
  { id: "programmes", label: "Programmes", href: "/programmes", isVisible: true, newTab: false },
  { id: "community", label: "Community", href: "/community", isVisible: true, newTab: false },
  { id: "faq", label: "FAQ", href: "/faq", isVisible: true, newTab: false },
  { id: "contact", label: "Contact", href: "/contact", isVisible: true, newTab: false },
];

const standardPage = (
  slug: string,
  title: string,
  description: string,
): PageContent => ({
  slug,
  title,
  seoDescription: description,
  isPublished: true,
  sections: [],
});

export const defaultCmsSnapshot: CmsSnapshot = {
  settings: {
    brandName: "CH Elevate",
    brandTagline: "Consultancy Limited",
    headerCtaLabel: "Book a call",
    headerCtaHref: "/book",
    footerSummary:
      "PMO consultancy, process efficiency, coaching, and implementation support that stays with you until results are real.",
    footerAddress: "Kingston\nJamaica",
    footerEmail: "hello@chelevate.com",
    footerPhone: "Phone number to be confirmed",
    mapEmbedUrl:
      "https://www.openstreetmap.org/export/embed.html?bbox=-76.839%2C17.956%2C-76.751%2C18.056&layer=mapnik&marker=18.0179%2C-76.8099",
    mapDirectionsUrl:
      "https://www.openstreetmap.org/?mlat=18.0179&mlon=-76.8099#map=13/18.0179/-76.8099",
    socialLinks: [
      { id: "linkedin", label: "LinkedIn", href: "https://www.linkedin.com/", isVisible: true, newTab: true },
      { id: "facebook", label: "Facebook", href: "https://www.facebook.com/", isVisible: true, newTab: true },
      { id: "instagram", label: "Instagram", href: "https://www.instagram.com/", isVisible: true, newTab: true },
      { id: "youtube", label: "YouTube", href: "https://www.youtube.com/", isVisible: true, newTab: true },
    ],
    footerCompanyLinks: [
      { id: "footer-about", label: "About us", href: "/about", isVisible: true, newTab: false },
      { id: "footer-programmes", label: "Programmes", href: "/programmes", isVisible: true, newTab: false },
      { id: "footer-community", label: "Community", href: "/community", isVisible: true, newTab: false },
      { id: "footer-portfolio", label: "Success stories", href: "/portfolio", isVisible: true, newTab: false },
      { id: "footer-faq", label: "FAQ", href: "/faq", isVisible: true, newTab: false },
    ],
    copyright: "Copyright © 2026 CH Elevate Consultancy Limited. All rights reserved.",
    navigation: sharedNavigation,
  },
  heroSlides: [
    {
      id: "home-primary",
      pageSlug: "home",
      eyebrow: "Strategy, structure & sustained change",
      title: "Elevate Your Organisation. Deliver with Confidence.",
      description:
        "For leaders who mean business. Build the systems, skills, and leadership capacity that drive measurable, lasting results.",
      imageUrl: "/images/business-meeting.jpg",
      primaryCtaLabel: "Book a discovery call",
      primaryCtaHref: "/book",
      sortOrder: 0,
      isActive: true,
    },
    {
      id: "about-primary",
      pageSlug: "about",
      eyebrow: "",
      title: "We Are CH Elevate Where Expertise Meets Execution",
      description:
        "We do not just advise we stand beside you until the work is done.",
      imageUrl: "/images/diverse-business-shoot.jpg",
      primaryCtaLabel: "",
      primaryCtaHref: "",
      sortOrder: 0,
      isActive: true,
    },
    {
      id: "services-primary",
      pageSlug: "services",
      eyebrow: "",
      title: "Expert Consultancy. Practical Implementation. Lasting Results.",
      description: "Three disciplines that work together to transform your organisation.",
      imageUrl: "/images/people-working-on-business-charts.jpg",
      primaryCtaLabel: "",
      primaryCtaHref: "",
      sortOrder: 0,
      isActive: true,
    },
    {
      id: "portfolio-primary",
      pageSlug: "portfolio",
      eyebrow: "",
      title: "Real Organisations. Real Results. Real Impact.",
      description: "Evidence of what becomes possible when expertise meets execution.",
      imageUrl: "/images/people-working-on-business-charts.jpg",
      primaryCtaLabel: "",
      primaryCtaHref: "",
      sortOrder: 0,
      isActive: true,
    },
    {
      id: "faq-primary",
      pageSlug: "faq",
      eyebrow: "",
      title: "Frequently Asked Questions",
      description: "Everything you need to know about working with CH Elevate.",
      imageUrl: "/images/business-team-talk-eat-and-drink-on-stairs.jpg",
      primaryCtaLabel: "",
      primaryCtaHref: "",
      sortOrder: 0,
      isActive: true,
    },
    {
      id: "contact-primary",
      pageSlug: "contact",
      eyebrow: "",
      title: "Let's Talk. Your Transformation Begins With a Conversation.",
      description: "Reach out and expect a response within one business day.",
      imageUrl: "/images/a-businessman-using-a-smartphone.jpg",
      primaryCtaLabel: "",
      primaryCtaHref: "",
      sortOrder: 0,
      isActive: true,
    },
    {
      id: "programmes-primary",
      pageSlug: "programmes",
      eyebrow: "Programmes",
      title: "Structured Programmes Designed to Deliver Measurable Growth",
      description: "From intensive diagnostics to long-term transformation partnerships.",
      imageUrl: "/images/business-team-talk-eat-and-drink-on-stairs.jpg",
      primaryCtaLabel: "Find your programme",
      primaryCtaHref: "#individual",
      sortOrder: 0,
      isActive: true,
    },
    {
      id: "community-primary",
      pageSlug: "community",
      eyebrow: "Join the community",
      title: "Where Leaders Grow Together",
      description: "A professional community for leaders, practitioners, and change-makers.",
      imageUrl: "/images/two-casual-businessmen-using-tablet.jpg",
      primaryCtaLabel: "Explore membership",
      primaryCtaHref: "#membership",
      sortOrder: 0,
      isActive: true,
    },
  ],
  pages: [
    standardPage("home", "Home", "CH Elevate Consultancy Limited home page."),
    standardPage("about", "About us", "About CH Elevate Consultancy Limited."),
    standardPage("services", "Services", "CH Elevate consultancy, coaching, and training services."),
    standardPage("portfolio", "Success stories", "Representative CH Elevate transformation stories."),
    standardPage("programmes", "Programmes", "CH Elevate programmes for leaders, teams, and organisations."),
    standardPage("community", "Community", "Join the CH Elevate professional community."),
    standardPage("faq", "FAQ", "Frequently asked questions."),
    standardPage("contact", "Contact us", "Contact CH Elevate."),
    standardPage("book", "Book a consultation", "Request a consultation."),
  ],
  forms: [
    {
      key: "contact",
      name: "Contact form",
      description: "General enquiries from the Contact page.",
      submitLabel: "Send message",
      successMessage: "Thank you. Your message has been received.",
      isActive: true,
      fields: [
        { id: "contact-name", name: "name", label: "Name", type: "text", placeholder: "Name", helpText: "", isRequired: true, options: [] },
        { id: "contact-company", name: "company", label: "Company", type: "text", placeholder: "Company", helpText: "", isRequired: false, options: [] },
        { id: "contact-phone", name: "phone", label: "Phone", type: "tel", placeholder: "Phone", helpText: "", isRequired: false, options: [] },
        { id: "contact-email", name: "email", label: "Email", type: "email", placeholder: "Email", helpText: "", isRequired: true, options: [] },
        { id: "contact-subject", name: "subject", label: "Subject", type: "text", placeholder: "Subject", helpText: "", isRequired: true, options: [] },
        { id: "contact-message", name: "message", label: "Message", type: "textarea", placeholder: "Message", helpText: "", isRequired: true, options: [] },
      ],
    },
    {
      key: "booking",
      name: "Consultation booking",
      description: "Appointment request and pre-consultation questionnaire.",
      submitLabel: "Request consultation",
      successMessage:
        "Your appointment request has been received and is pending confirmation.",
      isActive: true,
      fields: [
        { id: "booking-name", name: "name", label: "Full name", type: "text", placeholder: "Full name", helpText: "", isRequired: true, options: [] },
        { id: "booking-email", name: "email", label: "Email", type: "email", placeholder: "Email address", helpText: "", isRequired: true, options: [] },
        { id: "booking-phone", name: "phone", label: "Phone", type: "tel", placeholder: "Phone number", helpText: "", isRequired: true, options: [] },
        { id: "booking-company", name: "company", label: "Company", type: "text", placeholder: "Company or organisation", helpText: "", isRequired: false, options: [] },
        { id: "booking-service", name: "service", label: "Service", type: "select", placeholder: "", helpText: "", isRequired: true, options: ["PMO Consultancy & Training", "Process Efficiency Improvement", "Coaching & Implementation Support", "Executive Programme", "Team or Cohort Programme", "Community Membership", "Not sure yet"] },
        { id: "booking-date", name: "date", label: "Preferred date", type: "date", placeholder: "", helpText: "", isRequired: true, options: [] },
        { id: "booking-time", name: "time", label: "Preferred time", type: "select", placeholder: "", helpText: "Available times update after you choose a date.", isRequired: true, options: [] },
        { id: "booking-priority", name: "priority", label: "What would make this consultation valuable?", type: "textarea", placeholder: "Describe the decision, challenge, or opportunity.", helpText: "", isRequired: true, options: [] },
        { id: "booking-timeline", name: "timeline", label: "Desired timeline", type: "select", placeholder: "", helpText: "", isRequired: true, options: ["Immediately", "Within 30 days", "Within 3 months", "Exploring options"] },
        { id: "booking-consent", name: "consent", label: "I consent to CH Elevate using this information to manage my appointment.", type: "checkbox", placeholder: "", helpText: "", isRequired: true, options: [] },
      ],
    },
    {
      key: "newsletter",
      name: "Newsletter subscription",
      description: "Email subscription form shown above the footer.",
      submitLabel: "Sign up",
      successMessage: "You are subscribed. Thank you.",
      isActive: true,
      fields: [
        { id: "newsletter-email", name: "email", label: "Email address", type: "email", placeholder: "Email", helpText: "", isRequired: true, options: [] },
      ],
    },
  ],
  availability: {
    timeZone: "America/Jamaica",
    slotMinutes: 30,
    leadTimeHours: 0,
    days: [
      { dayOfWeek: 0, isActive: true, startTime: "00:00", endTime: "24:00" },
      { dayOfWeek: 1, isActive: true, startTime: "00:00", endTime: "24:00" },
      { dayOfWeek: 2, isActive: true, startTime: "00:00", endTime: "24:00" },
      { dayOfWeek: 3, isActive: true, startTime: "00:00", endTime: "24:00" },
      { dayOfWeek: 4, isActive: true, startTime: "00:00", endTime: "24:00" },
      { dayOfWeek: 5, isActive: true, startTime: "00:00", endTime: "24:00" },
      { dayOfWeek: 6, isActive: true, startTime: "00:00", endTime: "24:00" },
    ],
    blockedDates: [],
  },
};
