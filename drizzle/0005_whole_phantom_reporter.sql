ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: accounts that existed before email verification are treated as verified.
UPDATE "users" SET "email_verified" = true;