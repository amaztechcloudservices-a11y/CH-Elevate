CREATE TYPE "public"."attendance_status" AS ENUM('not_recorded', 'attended', 'partially_attended', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."capacity_mode" AS ENUM('unlimited', 'soft', 'hard');--> statement-breakpoint
CREATE TYPE "public"."course_delivery_mode" AS ENUM('in_person', 'virtual', 'blended');--> statement-breakpoint
CREATE TYPE "public"."organisation_member_role" AS ENUM('coordinator', 'participant');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'invoiced', 'partially_paid', 'paid', 'waived', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('pending_review', 'approved', 'waitlisted', 'rejected', 'cancelled', 'completed');--> statement-breakpoint
CREATE TABLE "account_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid,
	"participant_id" uuid,
	"organisation_role" "organisation_member_role",
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"certificate_number" text NOT NULL,
	"participant_name" text NOT NULL,
	"course_title" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "course_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"due_at" timestamp with time zone,
	"notes" text,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid,
	"offering_id" uuid,
	"title" text NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_offerings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"code" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"time_zone" text DEFAULT 'America/Jamaica' NOT NULL,
	"delivery_mode" "course_delivery_mode" NOT NULL,
	"venue" text,
	"joining_instructions" text,
	"fee_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'JMD' NOT NULL,
	"registration_opens_at" timestamp with time zone,
	"registration_closes_at" timestamp with time zone,
	"substitution_cutoff_at" timestamp with time zone,
	"capacity_mode" "capacity_mode" DEFAULT 'hard' NOT NULL,
	"capacity" integer,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offering_id" uuid NOT NULL,
	"organisation_id" uuid,
	"applicant_name" text NOT NULL,
	"applicant_email" text NOT NULL,
	"applicant_phone" text,
	"status" "registration_status" DEFAULT 'pending_review' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"amount_due_cents" integer DEFAULT 0 NOT NULL,
	"payment_reference" text,
	"admin_notes" text,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"description" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisation_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organisation_id" uuid NOT NULL,
	"profile_id" uuid NOT NULL,
	"role" "organisation_member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"billing_email" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registration_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"offering_id" uuid NOT NULL,
	"profile_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"phone" text,
	"status" "registration_status" DEFAULT 'pending_review' NOT NULL,
	"attendance" "attendance_status" DEFAULT 'not_recorded' NOT NULL,
	"cancellation_requested_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_registration_id_course_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."course_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_participant_id_registration_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."registration_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_certificates" ADD CONSTRAINT "course_certificates_participant_id_registration_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."registration_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_invoices" ADD CONSTRAINT "course_invoices_registration_id_course_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."course_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_materials" ADD CONSTRAINT "course_materials_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_materials" ADD CONSTRAINT "course_materials_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_offerings" ADD CONSTRAINT "course_offerings_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_registrations" ADD CONSTRAINT "course_registrations_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_registrations" ADD CONSTRAINT "course_registrations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_memberships" ADD CONSTRAINT "organisation_memberships_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organisation_memberships" ADD CONSTRAINT "organisation_memberships_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_participants" ADD CONSTRAINT "registration_participants_registration_id_course_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."course_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_participants" ADD CONSTRAINT "registration_participants_offering_id_course_offerings_id_fk" FOREIGN KEY ("offering_id") REFERENCES "public"."course_offerings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_participants" ADD CONSTRAINT "registration_participants_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_invitations_token_idx" ON "account_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "account_invitations_email_idx" ON "account_invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "course_certificates_participant_idx" ON "course_certificates" USING btree ("participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_certificates_number_idx" ON "course_certificates" USING btree ("certificate_number");--> statement-breakpoint
CREATE UNIQUE INDEX "course_invoices_reference_idx" ON "course_invoices" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "course_invoices_storage_key_idx" ON "course_invoices" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "course_invoices_registration_idx" ON "course_invoices" USING btree ("registration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_materials_storage_key_idx" ON "course_materials" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "course_materials_scope_idx" ON "course_materials" USING btree ("course_id","offering_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_offerings_code_idx" ON "course_offerings" USING btree ("code");--> statement-breakpoint
CREATE INDEX "course_offerings_course_start_idx" ON "course_offerings" USING btree ("course_id","starts_at");--> statement-breakpoint
CREATE INDEX "course_registrations_offering_status_idx" ON "course_registrations" USING btree ("offering_id","status");--> statement-breakpoint
CREATE INDEX "course_registrations_org_idx" ON "course_registrations" USING btree ("organisation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "courses_slug_idx" ON "courses" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "courses_active_idx" ON "courses" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "organisation_membership_unique_idx" ON "organisation_memberships" USING btree ("organisation_id","profile_id");--> statement-breakpoint
CREATE INDEX "organisation_membership_profile_idx" ON "organisation_memberships" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "organisations_name_idx" ON "organisations" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_offering_email_idx" ON "registration_participants" USING btree ("offering_id","email_normalized");--> statement-breakpoint
CREATE INDEX "participant_profile_idx" ON "registration_participants" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "participant_registration_idx" ON "registration_participants" USING btree ("registration_id");