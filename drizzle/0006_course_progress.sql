CREATE TYPE "public"."course_item_kind" AS ENUM('LAB', 'DEBUG');--> statement-breakpoint
CREATE TABLE "course_item_results" (
	"user_id" uuid NOT NULL,
	"lesson_id" text NOT NULL,
	"kind" "course_item_kind" NOT NULL,
	"item_key" text NOT NULL,
	"passed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "course_item_results_user_id_lesson_id_kind_item_key_pk" PRIMARY KEY("user_id","lesson_id","kind","item_key")
);
--> statement-breakpoint
CREATE TABLE "course_learning_results" (
	"user_id" uuid NOT NULL,
	"lesson_id" text NOT NULL,
	"quiz_attempts" integer DEFAULT 0 NOT NULL,
	"quiz_best" integer,
	"quiz_total" integer,
	"quiz_last_at" timestamp,
	"labs_passed" integer DEFAULT 0 NOT NULL,
	"labs_total" integer DEFAULT 0 NOT NULL,
	"debugs_solved" integer DEFAULT 0 NOT NULL,
	"wrong_total" integer DEFAULT 0 NOT NULL,
	"flagged" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "course_learning_results_user_id_lesson_id_pk" PRIMARY KEY("user_id","lesson_id")
);
--> statement-breakpoint
CREATE TABLE "course_quiz_answers" (
	"user_id" uuid NOT NULL,
	"lesson_id" text NOT NULL,
	"question_index" integer NOT NULL,
	"option_index" integer,
	"wrong_count" integer DEFAULT 0 NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"answered_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "course_quiz_answers_user_id_lesson_id_question_index_pk" PRIMARY KEY("user_id","lesson_id","question_index")
);
--> statement-breakpoint
CREATE TABLE "course_quiz_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lesson_id" text NOT NULL,
	"score" integer NOT NULL,
	"total" integer NOT NULL,
	"completed_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course_item_results" ADD CONSTRAINT "course_item_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_learning_results" ADD CONSTRAINT "course_learning_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_quiz_answers" ADD CONSTRAINT "course_quiz_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_quiz_attempts" ADD CONSTRAINT "course_quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "course_quiz_attempts_unique" ON "course_quiz_attempts" USING btree ("user_id","lesson_id","completed_at");