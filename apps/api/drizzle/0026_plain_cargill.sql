CREATE TYPE "public"."income_stability" AS ENUM('stable', 'variable', 'irregular');--> statement-breakpoint
CREATE TYPE "public"."salary_source" AS ENUM('manually_confirmed');--> statement-breakpoint
CREATE TABLE "financial_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"monthly_work_minutes" integer NOT NULL,
	"salary_credit_day" integer,
	"expected_annual_increment_bps" integer,
	"income_stability" "income_stability" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "financial_profiles_monthly_work_minutes_valid" CHECK ("financial_profiles"."monthly_work_minutes" > 0 AND "financial_profiles"."monthly_work_minutes" <= 44640),
	CONSTRAINT "financial_profiles_salary_credit_day_valid" CHECK ("financial_profiles"."salary_credit_day" IS NULL OR ("financial_profiles"."salary_credit_day" >= 1 AND "financial_profiles"."salary_credit_day" <= 31)),
	CONSTRAINT "financial_profiles_increment_bps_valid" CHECK ("financial_profiles"."expected_annual_increment_bps" IS NULL OR ("financial_profiles"."expected_annual_increment_bps" >= 0 AND "financial_profiles"."expected_annual_increment_bps" <= 100000))
);
--> statement-breakpoint
CREATE TABLE "salary_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"net_monthly_salary_minor" bigint NOT NULL,
	"annual_ctc_minor" bigint,
	"effective_from" timestamp with time zone NOT NULL,
	"source" "salary_source" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "salary_versions_net_monthly_salary_minor_positive" CHECK ("salary_versions"."net_monthly_salary_minor" > 0),
	CONSTRAINT "salary_versions_annual_ctc_minor_positive" CHECK ("salary_versions"."annual_ctc_minor" IS NULL OR "salary_versions"."annual_ctc_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "financial_profiles" ADD CONSTRAINT "financial_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_versions" ADD CONSTRAINT "salary_versions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "salary_versions_user_id_effective_from_unique" ON "salary_versions" USING btree ("user_id","effective_from");--> statement-breakpoint
CREATE INDEX "salary_versions_user_id_effective_from_id" ON "salary_versions" USING btree ("user_id","effective_from" DESC NULLS LAST,"id" DESC NULLS LAST);