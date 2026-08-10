CREATE TYPE "public"."recurring_occurrence_status" AS ENUM('expected', 'confirmed');--> statement-breakpoint
CREATE TABLE "recurring_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"recurring_rule_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"status" "recurring_occurrence_status" DEFAULT 'expected' NOT NULL,
	"confirmed_transaction_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD COLUMN "auto_post" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_recurring_rule_id_recurring_rules_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_occurrences" ADD CONSTRAINT "recurring_occurrences_confirmed_transaction_id_transactions_id_fk" FOREIGN KEY ("confirmed_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_occurrences_rule_occurred_at_unique" ON "recurring_occurrences" USING btree ("recurring_rule_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_occurrences_confirmed_transaction_unique" ON "recurring_occurrences" USING btree ("confirmed_transaction_id");--> statement-breakpoint
CREATE INDEX "recurring_occurrences_user_id_status" ON "recurring_occurrences" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "recurring_occurrences_user_id_rule_id_occurred_at" ON "recurring_occurrences" USING btree ("user_id","recurring_rule_id","occurred_at");