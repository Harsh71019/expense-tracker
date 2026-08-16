CREATE TYPE "public"."safety_buffer_mode" AS ENUM('fixed_amount', 'essential_months', 'emergency_fund_goal');--> statement-breakpoint
CREATE TABLE "safety_buffer_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"mode" "safety_buffer_mode" NOT NULL,
	"amount_minor" bigint,
	"months" integer,
	"emergency_fund_goal_id" uuid,
	"effective_from" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "safety_buffer_preferences_amount_minor_valid" CHECK ("safety_buffer_preferences"."amount_minor" IS NULL OR "safety_buffer_preferences"."amount_minor" >= 0),
	CONSTRAINT "safety_buffer_preferences_months_valid" CHECK ("safety_buffer_preferences"."months" IS NULL OR ("safety_buffer_preferences"."months" >= 1 AND "safety_buffer_preferences"."months" <= 36))
);
--> statement-breakpoint
ALTER TABLE "safety_buffer_preferences" ADD CONSTRAINT "safety_buffer_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safety_buffer_preferences" ADD CONSTRAINT "safety_buffer_preferences_emergency_fund_goal_id_goals_id_fk" FOREIGN KEY ("emergency_fund_goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "safety_buffer_preferences_user_version_idx" ON "safety_buffer_preferences" USING btree ("user_id","version");--> statement-breakpoint
CREATE INDEX "safety_buffer_preferences_user_effective_idx" ON "safety_buffer_preferences" USING btree ("user_id","effective_from" DESC NULLS LAST,"version" DESC NULLS LAST);