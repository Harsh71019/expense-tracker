ALTER TABLE "import_batches" ADD COLUMN "reconciliation" jsonb;--> statement-breakpoint
ALTER TABLE "staged_rows" ADD COLUMN "matched_transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "staged_rows" ADD COLUMN "statement_reference" text;--> statement-breakpoint
ALTER TABLE "staged_rows" ADD COLUMN "statement_closing_balance_minor" bigint;--> statement-breakpoint
CREATE UNIQUE INDEX "staged_rows_batch_match_unique" ON "staged_rows" USING btree ("batch_id","matched_transaction_id") WHERE "staged_rows"."matched_transaction_id" IS NOT NULL;