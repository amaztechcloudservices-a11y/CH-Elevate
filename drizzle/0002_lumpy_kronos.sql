ALTER TABLE "profiles" ADD COLUMN "job_title" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "time_zone" text DEFAULT 'America/Jamaica' NOT NULL;