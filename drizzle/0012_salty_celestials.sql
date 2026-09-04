CREATE TABLE "public_submission_limits" (
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"request_count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "public_submission_limits_bucket_idx" ON "public_submission_limits" USING btree ("scope","key_hash","window_started_at");--> statement-breakpoint
CREATE INDEX "public_submission_limits_expiry_idx" ON "public_submission_limits" USING btree ("expires_at");