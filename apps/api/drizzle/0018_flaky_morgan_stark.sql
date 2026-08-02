CREATE TYPE "public"."recurring_reconciliation_resolution" AS ENUM('confirmed_duplicate', 'confirmed_distinct');--> statement-breakpoint
CREATE TYPE "public"."recurring_reconciliation_status" AS ENUM('auto_matched', 'ambiguous', 'amount_mismatch');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'recurring_reconciliation_pending';--> statement-breakpoint
CREATE TABLE "recurring_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"incoming_transaction_id" uuid NOT NULL,
	"recurring_rule_id" uuid,
	"recurring_transaction_id" uuid,
	"candidate_recurring_transaction_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"status" "recurring_reconciliation_status" NOT NULL,
	"resolution" "recurring_reconciliation_resolution",
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "recurring_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "recurring_reconciliations" ADD CONSTRAINT "recurring_reconciliations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_reconciliations" ADD CONSTRAINT "recurring_reconciliations_incoming_transaction_id_transactions_id_fk" FOREIGN KEY ("incoming_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_reconciliations" ADD CONSTRAINT "recurring_reconciliations_recurring_rule_id_recurring_rules_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_reconciliations" ADD CONSTRAINT "recurring_reconciliations_recurring_transaction_id_transactions_id_fk" FOREIGN KEY ("recurring_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_reconciliations_incoming_transaction_id_unique" ON "recurring_reconciliations" USING btree ("incoming_transaction_id");--> statement-breakpoint
CREATE INDEX "recurring_reconciliations_user_id_status" ON "recurring_reconciliations" USING btree ("user_id","status");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_rule_id_recurring_rules_id_fk" FOREIGN KEY ("recurring_rule_id") REFERENCES "public"."recurring_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_recurring_rule_id" ON "transactions" USING btree ("recurring_rule_id") WHERE "transactions"."recurring_rule_id" IS NOT NULL;