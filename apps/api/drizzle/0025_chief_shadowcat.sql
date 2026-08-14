CREATE TYPE "public"."goal_contribution_type" AS ENUM('deposit', 'withdrawal');--> statement-breakpoint
ALTER TYPE "public"."goal_funding_mode" ADD VALUE 'manual_envelope';--> statement-breakpoint
CREATE TABLE "goal_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"goal_id" uuid NOT NULL,
	"type" "goal_contribution_type" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"note" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "goal_contributions_amount_minor_positive" CHECK ("goal_contributions"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "goals" DROP CONSTRAINT "goals_funding_source_valid";--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_contributions" ADD CONSTRAINT "goal_contributions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_contributions_user_id_goal_id_occurred_at" ON "goal_contributions" USING btree ("user_id","goal_id","occurred_at");--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_funding_source_valid" CHECK ((
        ("goals"."funding_mode" = 'linked_account' AND "goals"."linked_account_id" IS NOT NULL AND "goals"."tag" IS NULL)
        OR
        ("goals"."funding_mode" = 'tagged' AND "goals"."linked_account_id" IS NULL AND "goals"."tag" IS NOT NULL)
        OR
        ("goals"."funding_mode" = 'manual_envelope' AND "goals"."linked_account_id" IS NULL AND "goals"."tag" IS NULL)
      ));