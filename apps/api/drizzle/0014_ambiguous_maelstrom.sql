ALTER TYPE "public"."notification_status" ADD VALUE 'delivering' BEFORE 'sent';--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "claim_token" uuid;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "last_error" text;--> statement-breakpoint
CREATE INDEX "notification_outbox_delivery_ready" ON "notification_outbox" USING btree ("status","lease_until","created_at");