CREATE TYPE "public"."test_auth_profile" AS ENUM('caller', 'admin', 'tutor', 'student', 'parent', 'none');--> statement-breakpoint
CREATE TABLE "test_fixtures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(100) NOT NULL,
	"description" text,
	"value" text,
	"resolver" jsonb,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "test_fixtures_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "request_path" text;--> statement-breakpoint
ALTER TABLE "test_scenarios" ADD COLUMN "auth_profile" "test_auth_profile" DEFAULT 'caller' NOT NULL;