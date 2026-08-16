CREATE TYPE "public"."declared_debt_kind" AS ENUM('credit_card', 'bnpl', 'personal_loan', 'consumer_loan', 'other');--> statement-breakpoint
CREATE TYPE "public"."declared_debt_status" AS ENUM('active', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."health_cover_status" AS ENUM('independent', 'employer_only', 'both', 'none', 'not_sure');--> statement-breakpoint
CREATE TYPE "public"."term_cover_status" AS ENUM('independent', 'employer_only', 'both', 'none', 'not_sure', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."term_not_applicable_reason" AS ENUM('no_financial_dependants', 'covered_by_existing_family_arrangement', 'other_personal_reason');--> statement-breakpoint
CREATE TABLE "declared_debts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "declared_debt_kind" NOT NULL,
	"declared_outstanding_minor" bigint,
	"annual_rate_bps" integer NOT NULL,
	"minimum_payment_minor" bigint,
	"linked_asset_id" uuid,
	"status" "declared_debt_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "declared_debts_annual_rate_bps_valid" CHECK ("declared_debts"."annual_rate_bps" >= 0 AND "declared_debts"."annual_rate_bps" <= 100000),
	CONSTRAINT "declared_debts_amounts_positive" CHECK (("declared_debts"."declared_outstanding_minor" IS NULL OR "declared_debts"."declared_outstanding_minor" > 0)
        AND ("declared_debts"."minimum_payment_minor" IS NULL OR "declared_debts"."minimum_payment_minor" > 0)),
	CONSTRAINT "declared_debts_amount_source_valid" CHECK (("declared_debts"."linked_asset_id" IS NULL) = ("declared_debts"."declared_outstanding_minor" IS NOT NULL)),
	CONSTRAINT "declared_debts_resolved_at_valid" CHECK (("declared_debts"."status" = 'resolved') = ("declared_debts"."resolved_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "protection_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"term_cover_status" "term_cover_status" NOT NULL,
	"independent_term_cover_minor" bigint,
	"employer_term_cover_minor" bigint,
	"independent_term_expires_on" timestamp with time zone,
	"term_not_applicable_reason" "term_not_applicable_reason",
	"health_cover_status" "health_cover_status" NOT NULL,
	"independent_health_base_cover_minor" bigint,
	"independent_health_super_top_up_minor" bigint,
	"employer_health_cover_minor" bigint,
	"independent_health_expires_on" timestamp with time zone,
	"dependant_count" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "protection_snapshots_dependant_count_valid" CHECK ("protection_snapshots"."dependant_count" >= 0 AND "protection_snapshots"."dependant_count" <= 20),
	CONSTRAINT "protection_snapshots_cover_amounts_positive" CHECK (("protection_snapshots"."independent_term_cover_minor" IS NULL OR "protection_snapshots"."independent_term_cover_minor" > 0)
        AND ("protection_snapshots"."employer_term_cover_minor" IS NULL OR "protection_snapshots"."employer_term_cover_minor" > 0)
        AND ("protection_snapshots"."independent_health_base_cover_minor" IS NULL OR "protection_snapshots"."independent_health_base_cover_minor" > 0)
        AND ("protection_snapshots"."independent_health_super_top_up_minor" IS NULL OR "protection_snapshots"."independent_health_super_top_up_minor" > 0)
        AND ("protection_snapshots"."employer_health_cover_minor" IS NULL OR "protection_snapshots"."employer_health_cover_minor" > 0)),
	CONSTRAINT "protection_snapshots_not_applicable_reason_valid" CHECK (("protection_snapshots"."term_cover_status" = 'not_applicable') = ("protection_snapshots"."term_not_applicable_reason" IS NOT NULL)),
	CONSTRAINT "protection_snapshots_term_cover_source_valid" CHECK (("protection_snapshots"."term_cover_status" IN ('independent', 'both')
          OR ("protection_snapshots"."independent_term_cover_minor" IS NULL AND "protection_snapshots"."independent_term_expires_on" IS NULL))
        AND ("protection_snapshots"."term_cover_status" IN ('employer_only', 'both') OR "protection_snapshots"."employer_term_cover_minor" IS NULL)),
	CONSTRAINT "protection_snapshots_health_cover_source_valid" CHECK (("protection_snapshots"."health_cover_status" IN ('independent', 'both')
          OR ("protection_snapshots"."independent_health_base_cover_minor" IS NULL
            AND "protection_snapshots"."independent_health_super_top_up_minor" IS NULL
            AND "protection_snapshots"."independent_health_expires_on" IS NULL))
        AND ("protection_snapshots"."health_cover_status" IN ('employer_only', 'both') OR "protection_snapshots"."employer_health_cover_minor" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "declared_debts" ADD CONSTRAINT "declared_debts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declared_debts" ADD CONSTRAINT "declared_debts_linked_asset_id_net_worth_assets_id_fk" FOREIGN KEY ("linked_asset_id") REFERENCES "public"."net_worth_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protection_snapshots" ADD CONSTRAINT "protection_snapshots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "declared_debts_user_id_status_created_at_id" ON "declared_debts" USING btree ("user_id","status","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "declared_debts_user_id_linked_asset_id" ON "declared_debts" USING btree ("user_id","linked_asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "protection_snapshots_user_id_effective_from_unique" ON "protection_snapshots" USING btree ("user_id","effective_from");--> statement-breakpoint
CREATE INDEX "protection_snapshots_user_id_effective_from_id" ON "protection_snapshots" USING btree ("user_id","effective_from" DESC NULLS LAST,"id" DESC NULLS LAST);