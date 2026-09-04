CREATE TABLE "course_lessons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"module_id" uuid NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"content_type" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"video_url" text DEFAULT '' NOT NULL,
	"material_id" uuid
);
--> statement-breakpoint
CREATE TABLE "course_modules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_lessons" ADD CONSTRAINT "course_lessons_module_id_course_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."course_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_lessons" ADD CONSTRAINT "course_lessons_material_id_course_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."course_materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_modules" ADD CONSTRAINT "course_modules_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_lessons_order_idx" ON "course_lessons" USING btree ("module_id","sort_order");--> statement-breakpoint
CREATE INDEX "course_modules_order_idx" ON "course_modules" USING btree ("course_id","sort_order");