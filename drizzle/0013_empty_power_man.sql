ALTER TABLE "account" ADD COLUMN "issuer" text;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "account"
    WHERE "provider_id" NOT IN ('credential', 'google')
  ) THEN
    RAISE EXCEPTION 'Unknown account provider found. Review and map its trusted provider namespace before applying this migration.';
  END IF;
END
$$;--> statement-breakpoint
UPDATE "account"
SET "issuer" = CASE
  WHEN "provider_id" = 'credential' THEN 'local:credential'
  WHEN "provider_id" = 'google' THEN 'local:oauth:google'
END;--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "account"
    GROUP BY "issuer", "account_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Account identity collision found. Resolve duplicate issuer and account_id pairs before applying this migration.';
  END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_account_idx" ON "account" USING btree ("issuer","account_id");--> statement-breakpoint
DROP INDEX "account_provider_account_idx";
