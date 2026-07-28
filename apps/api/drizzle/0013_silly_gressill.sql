CREATE TYPE "public"."import_workflow_operation" AS ENUM('parse', 'commit', 'revert');--> statement-breakpoint
ALTER TYPE "public"."import_batch_status" ADD VALUE 'pending_parse' BEFORE 'staged';--> statement-breakpoint
ALTER TYPE "public"."import_batch_status" ADD VALUE 'parsing' BEFORE 'staged';--> statement-breakpoint
ALTER TYPE "public"."import_batch_status" ADD VALUE 'commit_queued' BEFORE 'committed';--> statement-breakpoint
ALTER TYPE "public"."import_batch_status" ADD VALUE 'committing' BEFORE 'committed';--> statement-breakpoint
ALTER TYPE "public"."import_batch_status" ADD VALUE 'revert_queued' BEFORE 'reverted';--> statement-breakpoint
ALTER TYPE "public"."import_batch_status" ADD VALUE 'reverting' BEFORE 'reverted';--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "file_content_base64" text;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "workflow_operation" "import_workflow_operation";--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "workflow_correlation_id" text;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "workflow_token" uuid;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "workflow_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "workflow_available_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "workflow_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "workflow_error" text;--> statement-breakpoint
CREATE INDEX "import_batches_workflow_ready_idx" ON "import_batches" USING btree ("status","workflow_available_at","workflow_lease_until");