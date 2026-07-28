ALTER TABLE "idempotency_records" ADD COLUMN "request_fingerprint" text;--> statement-breakpoint
UPDATE "idempotency_records" SET "request_fingerprint" = 'legacy-request-intent-unknown';--> statement-breakpoint
ALTER TABLE "idempotency_records" ALTER COLUMN "request_fingerprint" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "idempotency_records_user_id_created_at" ON "idempotency_records" USING btree ("user_id","created_at");
