CREATE TYPE "public"."goal_funding_mode" AS ENUM('linked_account', 'tagged');--> statement-breakpoint
CREATE TYPE "public"."goal_status" AS ENUM('active', 'achieved', 'abandoned');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'goal_achieved';--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"target_minor" bigint NOT NULL,
	"target_date" timestamp with time zone,
	"funding_mode" "goal_funding_mode" NOT NULL,
	"linked_account_id" uuid,
	"tag" text,
	"priority" integer NOT NULL,
	"status" "goal_status" NOT NULL,
	"started_minor" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "goals_target_minor_positive" CHECK ("goals"."target_minor" > 0),
	CONSTRAINT "goals_priority_nonnegative" CHECK ("goals"."priority" >= 0),
	CONSTRAINT "goals_funding_source_valid" CHECK ((
        ("goals"."funding_mode" = 'linked_account' AND "goals"."linked_account_id" IS NOT NULL AND "goals"."tag" IS NULL)
        OR
        ("goals"."funding_mode" = 'tagged' AND "goals"."linked_account_id" IS NULL AND "goals"."tag" IS NOT NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_linked_account_id_accounts_id_fk" FOREIGN KEY ("linked_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "goals_user_id_tag_unique" ON "goals" USING btree ("user_id","tag") WHERE "goals"."tag" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "goals_linked_account_id_unique" ON "goals" USING btree ("linked_account_id") WHERE "goals"."status" = 'active' AND "goals"."linked_account_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "goals_user_id_status_priority" ON "goals" USING btree ("user_id","status","priority");