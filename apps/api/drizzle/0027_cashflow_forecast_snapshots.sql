CREATE TABLE "cashflow_forecast_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"horizon_days" integer NOT NULL,
	"model_version" integer NOT NULL,
	"input_digest" text NOT NULL,
	"input_watermark" jsonb NOT NULL,
	"sufficiency" jsonb NOT NULL,
	"resources" jsonb NOT NULL,
	"model" text NOT NULL,
	"point_balance_minor" bigint NOT NULL,
	"range" jsonb NOT NULL,
	"assumptions" jsonb NOT NULL,
	"metrics" jsonb NOT NULL,
	"shortfall" jsonb NOT NULL,
	"computed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cashflow_forecast_snapshots" ADD CONSTRAINT "cashflow_forecast_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cashflow_forecast_snapshots_retry_key" ON "cashflow_forecast_snapshots" USING btree ("user_id","as_of","horizon_days","model_version","input_digest");--> statement-breakpoint
CREATE INDEX "cashflow_forecast_snapshots_user_computed" ON "cashflow_forecast_snapshots" USING btree ("user_id","computed_at" DESC NULLS LAST,"id");