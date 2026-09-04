ALTER TYPE "public"."appointment_status" ADD VALUE 'rejected';--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "deleted_at" timestamp with time zone;