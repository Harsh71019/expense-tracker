ALTER TABLE "transactions" ADD COLUMN "dedupe_fingerprint_v2" text;--> statement-breakpoint
ALTER TABLE "staged_rows" ADD COLUMN "dedupe_fingerprint_v2" text;--> statement-breakpoint
ALTER TABLE "staged_rows" ADD COLUMN "near_duplicate_outcome" text;--> statement-breakpoint
ALTER TABLE "staged_rows" ADD COLUMN "near_duplicate_confidence_bps" integer;--> statement-breakpoint
ALTER TABLE "staged_rows" ADD COLUMN "near_duplicate_result" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_user_id_dedupe_fingerprint_v2_unique" ON "transactions" USING btree ("user_id","dedupe_fingerprint_v2") WHERE "transactions"."dedupe_fingerprint_v2" IS NOT NULL;