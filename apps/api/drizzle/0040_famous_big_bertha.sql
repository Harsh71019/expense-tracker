ALTER TYPE "public"."valuation_source" ADD VALUE 'market_quote';--> statement-breakpoint
CREATE TABLE "market_quote_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"asset_market_link_id" uuid NOT NULL,
	"provider" "market_data_provider" NOT NULL,
	"provider_instrument_id" text NOT NULL,
	"quote_unit" "market_quote_unit" NOT NULL,
	"price_micro_rupees_per_quote_unit" bigint NOT NULL,
	"provider_as_of" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "market_quote_snapshots_price_safe_positive" CHECK ("market_quote_snapshots"."price_micro_rupees_per_quote_unit" BETWEEN 1 AND 9007199254740991)
);
--> statement-breakpoint
ALTER TABLE "market_quote_snapshots" ADD CONSTRAINT "market_quote_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_quote_snapshots" ADD CONSTRAINT "market_quote_snapshots_asset_market_link_id_asset_market_links_id_fk" FOREIGN KEY ("asset_market_link_id") REFERENCES "public"."asset_market_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "market_quote_snapshots_link_provider_asof_unique" ON "market_quote_snapshots" USING btree ("user_id","asset_market_link_id","provider","provider_as_of");--> statement-breakpoint
CREATE INDEX "market_quote_snapshots_user_link_provider_asof" ON "market_quote_snapshots" USING btree ("user_id","asset_market_link_id","provider_as_of" DESC NULLS LAST);