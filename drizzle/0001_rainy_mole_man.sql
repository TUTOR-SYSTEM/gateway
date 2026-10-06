ALTER TABLE "request_logs" ADD COLUMN "request_headers" text;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "response_headers" text;--> statement-breakpoint
ALTER TABLE "request_logs" ADD COLUMN "host" varchar(100);