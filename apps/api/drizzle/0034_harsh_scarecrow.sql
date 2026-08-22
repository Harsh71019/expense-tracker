ALTER TABLE "monthly_rollups" ADD COLUMN "total_cash_outflow_minor" bigint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "monthly_rollups" ADD COLUMN "total_consumption_minor" bigint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "monthly_rollups" ADD COLUMN "total_asset_funding_minor" bigint NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "monthly_rollups" ADD COLUMN "consumption_by_category" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "monthly_rollups" ADD COLUMN "formula_version" bigint NOT NULL DEFAULT 1;
