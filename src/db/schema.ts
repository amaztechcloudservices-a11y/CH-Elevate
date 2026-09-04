import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { BookingEventDefinition } from "@/lib/booking-events";
import type { BookingMailKind, BookingMailSettings } from "@/lib/booking-mail";

export const bookingEmailSettings = pgTable("booking_email_settings", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<BookingMailSettings>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const publicSubmissionLimits = pgTable("public_submission_limits", {
  scope: text("scope").notNull(),
  keyHash: text("key_hash").notNull(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  requestCount: integer("request_count").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("public_submission_limits_bucket_idx").on(table.scope, table.keyHash, table.windowStartedAt),
  index("public_submission_limits_expiry_idx").on(table.expiresAt),
]);

export const bookingEvents = pgTable("booking_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  data: jsonb("data").$type<BookingEventDefinition>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const staffRole = pgEnum("staff_role", [
  "client_admin",
  "staff",
  "customer",
]);
export const enquiryStatus = pgEnum("enquiry_status", [
  "new",
  "in_progress",
  "resolved",
  "spam",
]);
export const appointmentStatus = pgEnum("appointment_status", [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
  "rejected",
]);
export const submissionStatus = pgEnum("submission_status", [
  "new",
  "reviewed",
  "archived",
]);
export const courseDeliveryMode = pgEnum("course_delivery_mode", ["in_person", "virtual", "blended"]);
export const capacityMode = pgEnum("capacity_mode", ["unlimited", "soft", "hard"]);
export const registrationStatus = pgEnum("registration_status", [
  "pending_review", "approved", "waitlisted", "rejected", "cancelled", "completed",
]);
export const paymentStatus = pgEnum("payment_status", [
  "unpaid", "invoiced", "partially_paid", "paid", "waived", "refunded",
]);
export const attendanceStatus = pgEnum("attendance_status", [
  "not_recorded", "attended", "partially_attended", "no_show",
]);
export const organisationMemberRole = pgEnum("organisation_member_role", ["coordinator", "participant"]);

// Better Auth core tables. Keeping these in the same application database
// gives the client administrator one integrated account and permission model.
export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("user_email_idx").on(table.email)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("session_token_idx").on(table.token),
    index("session_user_id_idx").on(table.userId),
  ],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    issuer: text("issuer").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_issuer_account_idx").on(
      table.issuer,
      table.accountId,
    ),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authUserId: text("auth_user_id").notNull(),
    role: staffRole("role").default("customer").notNull(),
    displayName: text("display_name").notNull(),
    phone: text("phone"),
    jobTitle: text("job_title"),
    country: text("country"),
    timeZone: text("time_zone").default("America/Jamaica").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("profiles_auth_user_id_idx").on(table.authUserId),
    index("profiles_role_idx").on(table.role),
  ],
);

export const studentPosts = pgTable("student_posts", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  isPublished: boolean("is_published").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("student_posts_profile_idx").on(table.profileId, table.createdAt)]);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    company: text("company"),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    consent: boolean("consent").notNull(),
    status: enquiryStatus("status").default("new").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("contacts_email_idx").on(table.email),
    index("contacts_status_created_at_idx").on(table.status, table.createdAt),
  ],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    consent: boolean("consent").notNull(),
    source: text("source").default("website").notNull(),
    subscribedAt: timestamp("subscribed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("subscriptions_email_idx").on(table.email)],
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bookingEventId: uuid("booking_event_id").references(() => bookingEvents.id, { onDelete: "restrict" }),
    customerProfileId: uuid("customer_profile_id").references(
      () => profiles.id,
      { onDelete: "set null" },
    ),
    assignedStaffProfileId: uuid("assigned_staff_profile_id").references(
      () => profiles.id,
      { onDelete: "set null" },
    ),
    service: text("service").notNull(),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone"),
    company: text("company"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    timeZone: text("time_zone").notNull(),
    status: appointmentStatus("status").default("pending").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    notes: text("notes"),
    questionnaire: jsonb("questionnaire")
      .$type<Record<string, string | string[] | boolean>>()
      .default({})
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("appointments_starts_at_idx").on(table.startsAt),
    index("appointments_staff_starts_at_idx").on(
      table.assignedStaffProfileId,
      table.startsAt,
    ),
    index("appointments_status_idx").on(table.status),
  ],
);

export const cmsDocuments = pgTable(
  "cms_documents",
  {
    key: text("key").primaryKey(),
    documentType: text("document_type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    updatedByAuthUserId: text("updated_by_auth_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("cms_documents_type_idx").on(table.documentType)],
);

export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    formKey: text("form_key").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, string | string[] | boolean>>()
      .notNull(),
    status: submissionStatus("status").default("new").notNull(),
    sourcePath: text("source_path"),
    submittedByAuthUserId: text("submitted_by_auth_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("form_submissions_form_created_idx").on(
      table.formKey,
      table.createdAt,
    ),
    index("form_submissions_status_idx").on(table.status),
  ],
);

export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dayOfWeek: integer("day_of_week").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    slotMinutes: integer("slot_minutes").default(60).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("availability_rules_day_idx").on(table.dayOfWeek)],
);

export const bookingMailDeliveries = pgTable("booking_mail_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookingId: uuid("booking_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
  bookingVersion: text("booking_version").notNull(),
  kind: text("kind").$type<BookingMailKind>().notNull(),
  state: text("state").$type<"pending" | "sending" | "accepted" | "failed" | "unknown" | "superseded" | "disabled">().default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("booking_mail_version_kind_idx").on(table.bookingId, table.bookingVersion, table.kind), index("booking_mail_state_idx").on(table.state, table.createdAt)]);

export const bookingBlocks = pgTable(
  "booking_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("booking_blocks_starts_at_idx").on(table.startsAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorAuthUserId: text("actor_auth_user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("audit_logs_actor_idx").on(table.actorAuthUserId),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ],
);

export const courseCategories = pgTable("course_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
}, (table) => [uniqueIndex("course_categories_name_idx").on(table.name)]);

export const courses = pgTable("courses", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  description: text("description").notNull(),
  subtitle: text("subtitle").default("").notNull(),
  bannerUrl: text("banner_url").default("").notNull(),
  instructorId: uuid("instructor_id").references(() => profiles.id, { onDelete: "set null" }),
  categoryId: uuid("category_id").references(() => courseCategories.id, { onDelete: "set null" }),
  skillLevel: text("skill_level").$type<"all_levels" | "beginner" | "intermediate" | "advanced">().default("all_levels").notNull(),
  status: text("status").$type<"draft" | "published" | "archived">().default("draft").notNull(),
  accessType: text("access_type").$type<"free" | "one_time" | "subscription" | "private">().default("free").notNull(),
  priceCents: integer("price_cents").default(0).notNull(),
  currency: text("currency").default("JMD").notNull(),
  subscription: text("subscription").default("").notNull(),
  enrollmentLimit: integer("enrollment_limit"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("courses_slug_idx").on(table.slug), index("courses_active_idx").on(table.isActive)]);

export const courseModules = pgTable("course_modules", {
  id: uuid("id").primaryKey(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull(),
  isPublished: boolean("is_published").default(false).notNull(),
}, (table) => [index("course_modules_order_idx").on(table.courseId, table.sortOrder)]);

export const courseOfferings = pgTable("course_offerings", {
  id: uuid("id").defaultRandom().primaryKey(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  timeZone: text("time_zone").default("America/Jamaica").notNull(),
  deliveryMode: courseDeliveryMode("delivery_mode").notNull(),
  venue: text("venue"),
  joiningInstructions: text("joining_instructions"),
  feeCents: integer("fee_cents").default(0).notNull(),
  currency: text("currency").default("JMD").notNull(),
  registrationOpensAt: timestamp("registration_opens_at", { withTimezone: true }),
  registrationClosesAt: timestamp("registration_closes_at", { withTimezone: true }),
  substitutionCutoffAt: timestamp("substitution_cutoff_at", { withTimezone: true }),
  capacityMode: capacityMode("capacity_mode").default("hard").notNull(),
  capacity: integer("capacity"),
  isPublished: boolean("is_published").default(false).notNull(),
  isCancelled: boolean("is_cancelled").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("course_offerings_code_idx").on(table.code), index("course_offerings_course_start_idx").on(table.courseId, table.startsAt)]);

export const organisations = pgTable("organisations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  billingEmail: text("billing_email"),
  phone: text("phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("organisations_name_idx").on(table.name)]);

export const organisationMemberships = pgTable("organisation_memberships", {
  id: uuid("id").defaultRandom().primaryKey(),
  organisationId: uuid("organisation_id").notNull().references(() => organisations.id, { onDelete: "cascade" }),
  profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  role: organisationMemberRole("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("organisation_membership_unique_idx").on(table.organisationId, table.profileId), index("organisation_membership_profile_idx").on(table.profileId)]);

export const courseRegistrations = pgTable("course_registrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  offeringId: uuid("offering_id").notNull().references(() => courseOfferings.id, { onDelete: "cascade" }),
  organisationId: uuid("organisation_id").references(() => organisations.id, { onDelete: "set null" }),
  applicantName: text("applicant_name").notNull(),
  applicantEmail: text("applicant_email").notNull(),
  applicantPhone: text("applicant_phone"),
  status: registrationStatus("status").default("pending_review").notNull(),
  paymentStatus: paymentStatus("payment_status").default("unpaid").notNull(),
  amountDueCents: integer("amount_due_cents").default(0).notNull(),
  paymentReference: text("payment_reference"),
  adminNotes: text("admin_notes"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("course_registrations_offering_status_idx").on(table.offeringId, table.status), index("course_registrations_org_idx").on(table.organisationId)]);

export const registrationParticipants = pgTable("registration_participants", {
  id: uuid("id").defaultRandom().primaryKey(),
  registrationId: uuid("registration_id").notNull().references(() => courseRegistrations.id, { onDelete: "cascade" }),
  offeringId: uuid("offering_id").notNull().references(() => courseOfferings.id, { onDelete: "cascade" }),
  profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailNormalized: text("email_normalized").notNull(),
  phone: text("phone"),
  status: registrationStatus("status").default("pending_review").notNull(),
  attendance: attendanceStatus("attendance").default("not_recorded").notNull(),
  cancellationRequestedAt: timestamp("cancellation_requested_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("participant_offering_email_idx").on(table.offeringId, table.emailNormalized), index("participant_profile_idx").on(table.profileId), index("participant_registration_idx").on(table.registrationId)]);

export const courseMaterials = pgTable("course_materials", {
  id: uuid("id").defaultRandom().primaryKey(),
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "cascade" }),
  offeringId: uuid("offering_id").references(() => courseOfferings.id, { onDelete: "cascade" }),
  recipientProfileId: uuid("recipient_profile_id").references(() => profiles.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  storageKey: text("storage_key").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  version: integer("version").default(1).notNull(),
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("course_materials_storage_key_idx").on(table.storageKey), index("course_materials_scope_idx").on(table.courseId, table.offeringId)]);

export const courseInvoices = pgTable("course_invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  registrationId: uuid("registration_id").notNull().references(() => courseRegistrations.id, { onDelete: "cascade" }),
  reference: text("reference").notNull(),
  amountCents: integer("amount_cents").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  notes: text("notes"),
  documentType: text("document_type").default("invoice").notNull(),
  storageKey: text("storage_key").notNull(),
  originalFilename: text("original_filename").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("course_invoices_reference_idx").on(table.reference), uniqueIndex("course_invoices_storage_key_idx").on(table.storageKey), index("course_invoices_registration_idx").on(table.registrationId)]);

export const courseLessons = pgTable("course_lessons", {
  id: uuid("id").primaryKey(),
  moduleId: uuid("module_id").notNull().references(() => courseModules.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull(),
  isPublished: boolean("is_published").default(false).notNull(),
  contentType: text("content_type").$type<"text" | "video" | "material">().notNull(),
  text: text("text").default("").notNull(),
  videoUrl: text("video_url").default("").notNull(),
  materialId: uuid("material_id").references(() => courseMaterials.id, { onDelete: "set null" }),
}, (table) => [index("course_lessons_order_idx").on(table.moduleId, table.sortOrder)]);

export const coursePaymentRecords = pgTable("course_payment_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  registrationId: uuid("registration_id").notNull().references(() => courseRegistrations.id, { onDelete: "cascade" }),
  status: paymentStatus("status").notNull(),
  amountCents: integer("amount_cents"),
  reference: text("reference"),
  notes: text("notes"),
  recordedByAuthUserId: text("recorded_by_auth_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("course_payment_records_registration_idx").on(table.registrationId, table.createdAt)]);

export const courseCertificates = pgTable("course_certificates", {
  id: uuid("id").defaultRandom().primaryKey(),
  participantId: uuid("participant_id").notNull().references(() => registrationParticipants.id, { onDelete: "cascade" }),
  certificateNumber: text("certificate_number").notNull(),
  participantName: text("participant_name").notNull(),
  courseTitle: text("course_title").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [uniqueIndex("course_certificates_participant_idx").on(table.participantId), uniqueIndex("course_certificates_number_idx").on(table.certificateNumber)]);

export const accountInvitations = pgTable("account_invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  registrationId: uuid("registration_id").references(() => courseRegistrations.id, { onDelete: "cascade" }),
  participantId: uuid("participant_id").references(() => registrationParticipants.id, { onDelete: "cascade" }),
  organisationRole: organisationMemberRole("organisation_role"),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [uniqueIndex("account_invitations_token_idx").on(table.tokenHash), index("account_invitations_email_idx").on(table.email)]);
