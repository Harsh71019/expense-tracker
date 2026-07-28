CREATE TYPE "public"."scheduled_run_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "scheduled_job_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"job_name" text NOT NULL,
	"schedule_window" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" "scheduled_run_status" NOT NULL,
	"claim_token" uuid,
	"lease_until" timestamp with time zone,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"item_count" integer,
	"failure_summary" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "scheduled_job_runs_job_scheduled" ON "scheduled_job_runs" USING btree ("job_name","scheduled_for");--> statement-breakpoint
CREATE INDEX "scheduled_job_runs_status_lease" ON "scheduled_job_runs" USING btree ("status","lease_until");