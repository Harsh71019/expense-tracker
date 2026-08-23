CREATE TYPE "public"."asset_position_event_source" AS ENUM('manual', 'cas', 'broker_import', 'legacy_backfill');--> statement-breakpoint
CREATE TYPE "public"."asset_position_event_type" AS ENUM('opening', 'purchase', 'reinvestment', 'switch_in', 'redemption', 'switch_out', 'reconciliation_in', 'reconciliation_out', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."fund_scheme_option" AS ENUM('growth', 'idcw', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."fund_scheme_plan" AS ENUM('direct', 'regular', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."market_data_provider" AS ENUM('amfi', 'ibja', 'goldapi', 'metalpriceapi', 'manual');--> statement-breakpoint
CREATE TYPE "public"."market_instrument_type" AS ENUM('mutual_fund', 'gold_etf', 'silver_etf', 'gold_fund', 'silver_fund', 'sgb', 'physical_gold', 'physical_silver');--> statement-breakpoint
CREATE TYPE "public"."market_quote_unit" AS ENUM('fund_unit', 'gram');--> statement-breakpoint
CREATE TYPE "public"."sgb_acquisition_channel" AS ENUM('original_issue', 'secondary_market', 'unknown');--> statement-breakpoint
CREATE TABLE "asset_market_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"asset_id" uuid NOT NULL,
	"instrument_type" "market_instrument_type" NOT NULL,
	"provider" "market_data_provider" NOT NULL,
	"provider_instrument_id" text NOT NULL,
	"isin" text,
	"scheme_code" text,
	"scheme_plan" "fund_scheme_plan",
	"scheme_option" "fund_scheme_option",
	"acquisition_channel" "sgb_acquisition_channel",
	"quote_unit" "market_quote_unit" NOT NULL,
	"purity_bps" integer,
	"auto_valuation_enabled" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"revision_of" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "asset_market_links_quote_unit_matches_instrument" CHECK (("asset_market_links"."instrument_type" IN ('physical_gold', 'physical_silver') AND "asset_market_links"."quote_unit" = 'gram') OR ("asset_market_links"."instrument_type" NOT IN ('physical_gold', 'physical_silver') AND "asset_market_links"."quote_unit" = 'fund_unit')),
	CONSTRAINT "asset_market_links_purity_matches_instrument" CHECK (("asset_market_links"."purity_bps" IS NULL OR ("asset_market_links"."instrument_type" IN ('physical_gold', 'physical_silver') AND "asset_market_links"."purity_bps" BETWEEN 1 AND 10000))),
	CONSTRAINT "asset_market_links_sgb_acquisition_channel_matches_instrument" CHECK (("asset_market_links"."acquisition_channel" IS NULL OR "asset_market_links"."instrument_type" = 'sgb')),
	CONSTRAINT "asset_market_links_no_self_revision" CHECK ("asset_market_links"."revision_of" IS NULL OR "asset_market_links"."revision_of" <> "asset_market_links"."id")
);
--> statement-breakpoint
CREATE TABLE "asset_position_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"asset_id" uuid NOT NULL,
	"event_type" "asset_position_event_type" NOT NULL,
	"quantity_micro_units" bigint NOT NULL,
	"gross_amount_minor" bigint,
	"charges_minor" bigint,
	"taxes_at_acquisition_minor" bigint,
	"occurred_at" timestamp with time zone NOT NULL,
	"transaction_id" uuid,
	"asset_funding_id" uuid,
	"source" "asset_position_event_source" NOT NULL,
	"source_reference" text NOT NULL,
	"portfolio_import_row_id" uuid,
	"reversal_of" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "asset_position_events_quantity_safe_positive" CHECK ("asset_position_events"."quantity_micro_units" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "asset_position_events_gross_amount_safe_positive" CHECK ("asset_position_events"."gross_amount_minor" IS NULL OR "asset_position_events"."gross_amount_minor" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "asset_position_events_charges_safe_positive" CHECK ("asset_position_events"."charges_minor" IS NULL OR "asset_position_events"."charges_minor" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "asset_position_events_taxes_safe_positive" CHECK ("asset_position_events"."taxes_at_acquisition_minor" IS NULL OR "asset_position_events"."taxes_at_acquisition_minor" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "asset_position_events_reversal_link_matches_type" CHECK (("asset_position_events"."event_type" = 'reversal' AND "asset_position_events"."reversal_of" IS NOT NULL) OR ("asset_position_events"."event_type" <> 'reversal' AND "asset_position_events"."reversal_of" IS NULL)),
	CONSTRAINT "asset_position_events_no_self_reversal" CHECK ("asset_position_events"."reversal_of" IS NULL OR "asset_position_events"."reversal_of" <> "asset_position_events"."id")
);
--> statement-breakpoint
ALTER TABLE "asset_market_links" ADD CONSTRAINT "asset_market_links_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_market_links" ADD CONSTRAINT "asset_market_links_asset_id_net_worth_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."net_worth_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_market_links" ADD CONSTRAINT "asset_market_links_revision_of_asset_market_links_id_fk" FOREIGN KEY ("revision_of") REFERENCES "public"."asset_market_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_position_events" ADD CONSTRAINT "asset_position_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_position_events" ADD CONSTRAINT "asset_position_events_asset_id_net_worth_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."net_worth_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_position_events" ADD CONSTRAINT "asset_position_events_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_position_events" ADD CONSTRAINT "asset_position_events_asset_funding_id_asset_fundings_id_fk" FOREIGN KEY ("asset_funding_id") REFERENCES "public"."asset_fundings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_position_events" ADD CONSTRAINT "asset_position_events_reversal_of_asset_position_events_id_fk" FOREIGN KEY ("reversal_of") REFERENCES "public"."asset_position_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_market_links_one_active_per_asset" ON "asset_market_links" USING btree ("user_id","asset_id") WHERE "asset_market_links"."superseded_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_market_links_revision_of_unique" ON "asset_market_links" USING btree ("revision_of") WHERE "asset_market_links"."revision_of" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "asset_market_links_user_asset_effective_from" ON "asset_market_links" USING btree ("user_id","asset_id","effective_from" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "asset_position_events_user_source_reference_unique" ON "asset_position_events" USING btree ("user_id","source","source_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "asset_position_events_reversal_of_unique" ON "asset_position_events" USING btree ("reversal_of") WHERE "asset_position_events"."reversal_of" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "asset_position_events_user_asset_occurred_at_id" ON "asset_position_events" USING btree ("user_id","asset_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "asset_position_events_user_transaction" ON "asset_position_events" USING btree ("user_id","transaction_id");--> statement-breakpoint
CREATE INDEX "asset_position_events_user_asset_funding" ON "asset_position_events" USING btree ("user_id","asset_funding_id");--> statement-breakpoint
CREATE FUNCTION prevent_asset_position_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'asset_position_events are append-only; add a reversal event instead';
END;
$$;--> statement-breakpoint
CREATE TRIGGER asset_position_events_append_only
BEFORE UPDATE OR DELETE ON asset_position_events
FOR EACH ROW EXECUTE FUNCTION prevent_asset_position_event_mutation();
