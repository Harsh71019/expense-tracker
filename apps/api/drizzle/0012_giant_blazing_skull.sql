ALTER TABLE "import_batches" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "delivery_attempts" integer DEFAULT 0 NOT NULL;