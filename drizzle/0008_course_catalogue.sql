CREATE TABLE "course_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "subtitle" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "banner_url" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "instructor_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "skill_level" text DEFAULT 'all_levels' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "status" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "access_type" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "price_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "currency" text DEFAULT 'JMD' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "subscription" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "enrollment_limit" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "course_categories_name_idx" ON "course_categories" USING btree ("name");--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_instructor_id_profiles_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_category_id_course_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."course_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Preserve existing publication state; all newly created catalogue entries default to draft.
UPDATE "courses" SET "status" = CASE WHEN "is_active" THEN 'published' ELSE 'archived' END;
