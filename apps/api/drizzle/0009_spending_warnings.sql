CREATE TYPE "public"."spending_warning_analysis_status" AS ENUM('learning', 'ready');--> statement-breakpoint
CREATE TYPE "public"."spending_warning_kind" AS ENUM('overall_spend_spike', 'category_spend_spike', 'unusually_large_expense');--> statement-breakpoint
CREATE TYPE "public"."spending_warning_severity" AS ENUM('attention', 'high');--> statement-breakpoint
CREATE TYPE "public"."spending_warning_status" AS ENUM('active', 'dismissed', 'resolved');--> statement-breakpoint
CREATE TABLE "spending_warning_analysis_state" (
	"user_id" text PRIMARY KEY NOT NULL,
	"detector_version" bigint NOT NULL,
	"status" "spending_warning_analysis_status" NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	"source_through" timestamp with time zone NOT NULL,
	"history_start" timestamp with time zone,
	"baseline_expense_count" bigint NOT NULL,
	"eligible_kinds" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spending_warnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"kind" "spending_warning_kind" NOT NULL,
	"severity" "spending_warning_severity" NOT NULL,
	"status" "spending_warning_status" NOT NULL,
	"category_id" uuid,
	"transaction_id" uuid,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"evidence" jsonb NOT NULL,
	"detector_version" bigint NOT NULL,
	"first_detected_at" timestamp with time zone NOT NULL,
	"last_detected_at" timestamp with time zone NOT NULL,
	"dismissed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "spending_warning_analysis_state" ADD CONSTRAINT "spending_warning_analysis_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_warnings" ADD CONSTRAINT "spending_warnings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_warnings" ADD CONSTRAINT "spending_warnings_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_warnings" ADD CONSTRAINT "spending_warnings_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "spending_warnings_user_id_fingerprint_unique" ON "spending_warnings" USING btree ("user_id","fingerprint");--> statement-breakpoint
CREATE INDEX "spending_warnings_user_id_status_last_detected_at_id" ON "spending_warnings" USING btree ("user_id","status","last_detected_at" DESC NULLS LAST,"id" DESC NULLS LAST);