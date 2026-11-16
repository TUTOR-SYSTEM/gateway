CREATE TABLE "api_route_results" (
	"route_id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"doc" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_route_results" ADD CONSTRAINT "api_route_results_route_id_api_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."api_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_route_results" ADD CONSTRAINT "api_route_results_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;