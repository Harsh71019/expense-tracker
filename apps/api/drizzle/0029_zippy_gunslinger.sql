CREATE TYPE "public"."spending_change_direction" AS ENUM('increase', 'decrease');--> statement-breakpoint
CREATE TYPE "public"."spending_change_run_status" AS ENUM('running', 'completed', 'degraded', 'abstained', 'failed');--> statement-breakpoint
CREATE TYPE "public"."spending_regime_type" AS ENUM('variable_spending');--> statement-breakpoint
CREATE TABLE "detected_recurring_stream_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"stream_id" uuid NOT NULL,
	"supersedes_stream_id" uuid,
	"old_median_minor" bigint NOT NULL,
	"new_median_minor" bigint NOT NULL,
	"delta_minor" bigint NOT NULL,
	"direction" "spending_change_direction" NOT NULL,
	"confidence_bps" integer NOT NULL,
	"change_occurred_at" timestamp with time zone NOT NULL,
	"change_transaction_id" uuid NOT NULL,
	"evidence" jsonb NOT NULL,
	"input_watermark" jsonb NOT NULL,
	"detector_version" integer NOT NULL,
	"computed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spending_change_detection_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"detector_version" integer NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"input_digest" text NOT NULL,
	"input_watermark" jsonb NOT NULL,
	"status" "spending_change_run_status" NOT NULL,
	"sufficiency" jsonb NOT NULL,
	"resources" jsonb NOT NULL,
	"recurring_changes_count" integer DEFAULT 0 NOT NULL,
	"regimes_count" integer DEFAULT 0 NOT NULL,
	"abstained_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"failure_code" text
);
--> statement-breakpoint
CREATE TABLE "spending_regimes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"regime_type" "spending_regime_type" NOT NULL,
	"baseline_median_minor" bigint NOT NULL,
	"new_median_minor" bigint NOT NULL,
	"delta_minor" bigint NOT NULL,
	"direction" "spending_change_direction" NOT NULL,
	"confidence_bps" integer NOT NULL,
	"sufficiency" jsonb NOT NULL,
	"change_date" text NOT NULL,
	"occurred_at_start" timestamp with time zone NOT NULL,
	"occurred_at_end" timestamp with time zone NOT NULL,
	"evidence" jsonb NOT NULL,
	"input_watermark" jsonb NOT NULL,
	"supersedes_regime_id" uuid,
	"detector_version" integer NOT NULL,
	"computed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "detected_recurring_stream_changes" ADD CONSTRAINT "detected_recurring_stream_changes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_recurring_stream_changes" ADD CONSTRAINT "detected_recurring_stream_changes_stream_id_detected_recurring_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."detected_recurring_streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_recurring_stream_changes" ADD CONSTRAINT "detected_recurring_stream_changes_supersedes_stream_id_detected_recurring_streams_id_fk" FOREIGN KEY ("supersedes_stream_id") REFERENCES "public"."detected_recurring_streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detected_recurring_stream_changes" ADD CONSTRAINT "detected_recurring_stream_changes_change_transaction_id_transactions_id_fk" FOREIGN KEY ("change_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_change_detection_runs" ADD CONSTRAINT "spending_change_detection_runs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_regimes" ADD CONSTRAINT "spending_regimes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_regimes" ADD CONSTRAINT "spending_regimes_supersedes_regime_id_spending_regimes_id_fk" FOREIGN KEY ("supersedes_regime_id") REFERENCES "public"."spending_regimes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stream_changes_user_stream_version" ON "detected_recurring_stream_changes" USING btree ("user_id","stream_id","detector_version");--> statement-breakpoint
CREATE INDEX "stream_changes_user_computed" ON "detected_recurring_stream_changes" USING btree ("user_id","computed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stream_changes_stream_id" ON "detected_recurring_stream_changes" USING btree ("stream_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spending_change_runs_user_version_asof_digest" ON "spending_change_detection_runs" USING btree ("user_id","detector_version","as_of","input_digest");--> statement-breakpoint
CREATE INDEX "spending_change_runs_user_completed" ON "spending_change_detection_runs" USING btree ("user_id","completed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "spending_change_runs_status_started" ON "spending_change_detection_runs" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "spending_regimes_user_computed" ON "spending_regimes" USING btree ("user_id","computed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "spending_regimes_user_type_computed" ON "spending_regimes" USING btree ("user_id","regime_type","computed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "spending_regimes_user_date_type_version" ON "spending_regimes" USING btree ("user_id","regime_type","change_date","detector_version");