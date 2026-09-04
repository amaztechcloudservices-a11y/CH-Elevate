CREATE TABLE "booking_email_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_mail_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"booking_version" text NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_mail_deliveries" ADD CONSTRAINT "booking_mail_deliveries_booking_id_appointments_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booking_mail_version_kind_idx" ON "booking_mail_deliveries" USING btree ("booking_id","booking_version","kind");--> statement-breakpoint
CREATE INDEX "booking_mail_state_idx" ON "booking_mail_deliveries" USING btree ("state","created_at");