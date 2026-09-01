CREATE TABLE "course_payment_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"status" "payment_status" NOT NULL,
	"amount_cents" integer,
	"reference" text,
	"notes" text,
	"recorded_by_auth_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_invoices" ADD COLUMN "document_type" text DEFAULT 'invoice' NOT NULL;--> statement-breakpoint
ALTER TABLE "course_payment_records" ADD CONSTRAINT "course_payment_records_registration_id_course_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."course_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_payment_records_registration_idx" ON "course_payment_records" USING btree ("registration_id","created_at");