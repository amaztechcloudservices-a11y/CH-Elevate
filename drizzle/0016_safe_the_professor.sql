CREATE TABLE "operational_mail_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"recipient" text NOT NULL,
	"reply_to" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_code" text,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "operational_mail_ready_idx" ON "operational_mail_deliveries" USING btree ("state","available_at");--> statement-breakpoint
CREATE INDEX "operational_mail_created_idx" ON "operational_mail_deliveries" USING btree ("created_at");