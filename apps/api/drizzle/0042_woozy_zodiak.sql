CREATE TYPE "public"."reserve_liquidity_tier" AS ENUM('instant', 't_plus_1', 'locked');--> statement-breakpoint
CREATE TYPE "public"."reserve_source_kind" AS ENUM('account', 'asset');--> statement-breakpoint
CREATE TABLE "financial_reserve_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source_kind" "reserve_source_kind" NOT NULL,
	"source_id" uuid NOT NULL,
	"liquidity_tier" "reserve_liquidity_tier" NOT NULL,
	"is_included" boolean DEFAULT true NOT NULL,
	"eligible_cap_minor" bigint,
	"effective_from" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"revision_of" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "financial_reserve_sources_cap_safe_positive" CHECK ("financial_reserve_sources"."eligible_cap_minor" IS NULL OR "financial_reserve_sources"."eligible_cap_minor" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "financial_reserve_sources_no_self_revision" CHECK ("financial_reserve_sources"."revision_of" IS NULL OR "financial_reserve_sources"."revision_of" <> "financial_reserve_sources"."id")
);
--> statement-breakpoint
ALTER TABLE "financial_reserve_sources" ADD CONSTRAINT "financial_reserve_sources_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_reserve_sources" ADD CONSTRAINT "financial_reserve_sources_revision_of_financial_reserve_sources_id_fk" FOREIGN KEY ("revision_of") REFERENCES "public"."financial_reserve_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_reserve_sources_one_active_per_source" ON "financial_reserve_sources" USING btree ("user_id","source_kind","source_id") WHERE "financial_reserve_sources"."superseded_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_reserve_sources_revision_of_unique" ON "financial_reserve_sources" USING btree ("revision_of") WHERE "financial_reserve_sources"."revision_of" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "financial_reserve_sources_user_active_kind_id" ON "financial_reserve_sources" USING btree ("user_id","source_kind","source_id");--> statement-breakpoint
CREATE INDEX "financial_reserve_sources_user_source_effective_from" ON "financial_reserve_sources" USING btree ("user_id","source_kind","source_id","effective_from" DESC NULLS LAST,"id" DESC NULLS LAST);