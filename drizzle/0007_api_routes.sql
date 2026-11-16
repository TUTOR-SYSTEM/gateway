CREATE TABLE "api_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"scan_id" text NOT NULL,
	"key" text NOT NULL,
	"svc" text NOT NULL,
	"module" text NOT NULL,
	"type" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"handler" text DEFAULT '' NOT NULL,
	"file" text DEFAULT '' NOT NULL,
	"line" integer,
	"auth" text DEFAULT '' NOT NULL,
	"dto" text DEFAULT '' NOT NULL,
	"dev" boolean DEFAULT false NOT NULL,
	"flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_routes_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE INDEX "api_routes_svc_module_idx" ON "api_routes" USING btree ("svc","module");