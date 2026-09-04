CREATE TABLE "booking_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "booking_event_id" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_booking_event_id_booking_events_id_fk" FOREIGN KEY ("booking_event_id") REFERENCES "public"."booking_events"("id") ON DELETE restrict ON UPDATE no action;