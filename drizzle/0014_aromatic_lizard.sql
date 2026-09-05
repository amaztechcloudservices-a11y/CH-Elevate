ALTER TABLE "course_invoices" ADD COLUMN "currency" text DEFAULT 'JMD' NOT NULL;--> statement-breakpoint
ALTER TABLE "course_payment_records" ADD COLUMN "currency" text DEFAULT 'JMD' NOT NULL;--> statement-breakpoint
ALTER TABLE "course_registrations" ADD COLUMN "paid_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "course_registrations" ADD COLUMN "currency" text DEFAULT 'JMD' NOT NULL;--> statement-breakpoint
UPDATE "course_registrations" AS "registration"
SET "currency" = "offering"."currency"
FROM "course_offerings" AS "offering"
WHERE "registration"."offering_id" = "offering"."id";--> statement-breakpoint
UPDATE "course_registrations"
SET "paid_cents" = "amount_due_cents"
WHERE "payment_status" = 'paid';--> statement-breakpoint
UPDATE "course_invoices" AS "invoice"
SET "currency" = "registration"."currency"
FROM "course_registrations" AS "registration"
WHERE "invoice"."registration_id" = "registration"."id";--> statement-breakpoint
UPDATE "course_payment_records" AS "payment"
SET "currency" = "registration"."currency"
FROM "course_registrations" AS "registration"
WHERE "payment"."registration_id" = "registration"."id";
