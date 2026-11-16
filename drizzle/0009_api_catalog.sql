CREATE TABLE "api_catalog" (
	"scan_id" text PRIMARY KEY NOT NULL,
	"scanned_at" text NOT NULL,
	"commits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"branches" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"services" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sends" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"order" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
