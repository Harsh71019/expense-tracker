ALTER TABLE "import_batches" ADD COLUMN "reconciliation" jsonb;--> statement-breakpoint
ALTER TABLE "staged_rows" ADD COLUMN "matched_transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "staged_rows" ADD COLUMN "statement_reference" text;--> statement-breakpoint
ALTER TABLE "staged_rows" ADD COLUMN "statement_closing_balance_minor" bigint;--> statement-breakpoint
ALTER TABLE "staged_rows" ADD CONSTRAINT "staged_rows_matched_transaction_id_transactions_id_fk" FOREIGN KEY ("matched_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staged_rows_batch_match_unique" ON "staged_rows" USING btree ("batch_id","matched_transaction_id") WHERE "staged_rows"."matched_transaction_id" IS NOT NULL;