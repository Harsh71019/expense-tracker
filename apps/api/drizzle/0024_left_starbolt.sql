CREATE TYPE "public"."detected_stream_amount_behavior" AS ENUM('fixed', 'variable', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."detected_stream_cadence" AS ENUM('weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'annual');--> statement-breakpoint
CREATE TYPE "public"."detected_stream_state" AS ENUM('candidate', 'mature', 'stale');--> statement-breakpoint
CREATE TYPE "public"."recurring_detection_run_status" AS ENUM('running', 'completed', 'degraded', 'abstained', 'failed');--> statement-breakpoint
CREATE TABLE "detected_recurring_stream_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"stream_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"residual_days" integer NOT NULL,
	"normalizer_version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "detected_recurring_streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"logical_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"detector_version" integer NOT NULL,
	"transaction_type" "transaction_type" NOT NULL,
	"counterparty_key" text,
	"cadence" "detected_stream_cadence" NOT NULL,
	"state" "detected_stream_state" NOT NULL,
	"amount_behavior" "detected_stream_amount_behavior" NOT NULL,
	"confidence_bps" integer NOT NULL,
	"sufficiency" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"median_amount_minor" bigint NOT NULL,
	"mad_amount_minor" bigint NOT NULL,
	"next_expected_date" text,
	"input_watermark" jsonb NOT NULL,
	"supersedes_stream_id" uuid,
	"computed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_detection_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"detector_version" integer NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"input_digest" text NOT NULL,
	"input_watermark" jsonb NOT NULL,
	"status" "recurring_detection_run_status" NOT NULL,
	"sufficiency" jsonb NOT NULL,
	"resources" jsonb NOT NULL,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"mature_count" integer DEFAULT 0 NOT NULL,
	"stale_count" integer DEFAULT 0 NOT NULL,
	"abstained_group_count" integer DEFAULT 0 NOT NULL,
	"processed_stream_count" integer DEFAULT 0 NOT NULL,
	"total_stream_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"failure_code" text
);
--> statement-breakpoint
ALTER TABLE "detected_recurring_stream_members" ADD CONSTRAINT "detected_recurring_stream_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_recurring_stream_members" ADD CONSTRAINT "detected_recurring_stream_members_stream_id_detected_recurring_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."detected_recurring_streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_recurring_stream_members" ADD CONSTRAINT "detected_recurring_stream_members_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_recurring_streams" ADD CONSTRAINT "detected_recurring_streams_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_recurring_streams" ADD CONSTRAINT "detected_recurring_streams_supersedes_stream_id_detected_recurring_streams_id_fk" FOREIGN KEY ("supersedes_stream_id") REFERENCES "public"."detected_recurring_streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_detection_runs" ADD CONSTRAINT "recurring_detection_runs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "detected_stream_members_user_stream_txn" ON "detected_recurring_stream_members" USING btree ("user_id","stream_id","transaction_id");--> statement-breakpoint
CREATE INDEX "detected_stream_members_user_txn" ON "detected_recurring_stream_members" USING btree ("user_id","transaction_id");--> statement-breakpoint
CREATE INDEX "detected_stream_members_stream_id" ON "detected_recurring_stream_members" USING btree ("stream_id") WHERE "detected_recurring_stream_members"."stream_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "detected_streams_user_fingerprint_version" ON "detected_recurring_streams" USING btree ("user_id","fingerprint","detector_version");--> statement-breakpoint
CREATE INDEX "detected_streams_user_logical_computed" ON "detected_recurring_streams" USING btree ("user_id","logical_key","computed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "detected_streams_user_state_computed" ON "detected_recurring_streams" USING btree ("user_id","state","computed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "detected_streams_user_computed_id" ON "detected_recurring_streams" USING btree ("user_id","computed_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_detection_runs_user_version_asof_digest" ON "recurring_detection_runs" USING btree ("user_id","detector_version","as_of","input_digest");--> statement-breakpoint
CREATE INDEX "recurring_detection_runs_user_completed" ON "recurring_detection_runs" USING btree ("user_id","completed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "recurring_detection_runs_status_started" ON "recurring_detection_runs" USING btree ("status","started_at");