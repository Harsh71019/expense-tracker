CREATE TYPE "public"."portfolio_import_row_action" AS ENUM('create_asset', 'append_event', 'reconcile', 'ignore');--> statement-breakpoint
CREATE TYPE "public"."portfolio_import_row_kind" AS ENUM('holding', 'transaction');--> statement-breakpoint
CREATE TYPE "public"."portfolio_import_row_match_status" AS ENUM('matched', 'needs_confirmation', 'unmatched', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."portfolio_import_source" AS ENUM('kfintech_cams', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."portfolio_import_status" AS ENUM('queued', 'parsing', 'needs_review', 'ready', 'committing', 'completed', 'failed', 'reverting', 'reverted');--> statement-breakpoint
CREATE TABLE "portfolio_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source" "portfolio_import_source" NOT NULL,
	"filename" text NOT NULL,
	"file_hash" text NOT NULL,
	"status" "portfolio_import_status" NOT NULL,
	"statement_as_of" timestamp with time zone,
	"coverage_from" timestamp with time zone,
	"coverage_to" timestamp with time zone,
	"row_count" integer DEFAULT 0 NOT NULL,
	"included_count" integer DEFAULT 0 NOT NULL,
	"warning_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"failure_code" text,
	"lease_owner" uuid,
	"lease_expires_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "portfolio_import_batches_counts_nonnegative" CHECK ("portfolio_import_batches"."row_count" >= 0 AND "portfolio_import_batches"."included_count" >= 0 AND "portfolio_import_batches"."warning_count" >= 0 AND "portfolio_import_batches"."error_count" >= 0 AND "portfolio_import_batches"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "portfolio_import_payloads" (
	"batch_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"encrypted_file" "bytea" NOT NULL,
	"file_nonce" "bytea" NOT NULL,
	"file_auth_tag" "bytea" NOT NULL,
	"encrypted_password" "bytea",
	"password_nonce" "bytea",
	"password_auth_tag" "bytea",
	"key_version" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "portfolio_import_payloads_password_cipher_complete" CHECK (("portfolio_import_payloads"."encrypted_password" IS NULL AND "portfolio_import_payloads"."password_nonce" IS NULL AND "portfolio_import_payloads"."password_auth_tag" IS NULL) OR ("portfolio_import_payloads"."encrypted_password" IS NOT NULL AND "portfolio_import_payloads"."password_nonce" IS NOT NULL AND "portfolio_import_payloads"."password_auth_tag" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "portfolio_import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"row_kind" "portfolio_import_row_kind" NOT NULL,
	"semantic_fingerprint" text NOT NULL,
	"instrument_type" "market_instrument_type" NOT NULL,
	"isin" text,
	"scheme_code" text,
	"display_name" text NOT NULL,
	"folio_reference_masked" text,
	"transaction_type" text,
	"occurred_at" timestamp with time zone,
	"quantity_micro_units" bigint,
	"gross_amount_minor" bigint,
	"nav_micro_rupees_per_unit" bigint,
	"proposed_asset_id" uuid,
	"match_status" "portfolio_import_row_match_status" NOT NULL,
	"proposed_action" "portfolio_import_row_action" NOT NULL,
	"include" boolean DEFAULT true NOT NULL,
	"warning_code" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "portfolio_import_rows_number_nonnegative" CHECK ("portfolio_import_rows"."row_number" > 0),
	CONSTRAINT "portfolio_import_rows_quantity_safe" CHECK ("portfolio_import_rows"."quantity_micro_units" IS NULL OR "portfolio_import_rows"."quantity_micro_units" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "portfolio_import_rows_amount_safe" CHECK ("portfolio_import_rows"."gross_amount_minor" IS NULL OR "portfolio_import_rows"."gross_amount_minor" BETWEEN 1 AND 9007199254740991),
	CONSTRAINT "portfolio_import_rows_nav_safe" CHECK ("portfolio_import_rows"."nav_micro_rupees_per_unit" IS NULL OR "portfolio_import_rows"."nav_micro_rupees_per_unit" BETWEEN 1 AND 9007199254740991)
);
--> statement-breakpoint
ALTER TABLE "portfolio_import_batches" ADD CONSTRAINT "portfolio_import_batches_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_import_payloads" ADD CONSTRAINT "portfolio_import_payloads_batch_id_portfolio_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."portfolio_import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_import_payloads" ADD CONSTRAINT "portfolio_import_payloads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_import_rows" ADD CONSTRAINT "portfolio_import_rows_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_import_rows" ADD CONSTRAINT "portfolio_import_rows_batch_id_portfolio_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."portfolio_import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_import_rows" ADD CONSTRAINT "portfolio_import_rows_proposed_asset_id_net_worth_assets_id_fk" FOREIGN KEY ("proposed_asset_id") REFERENCES "public"."net_worth_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_import_batches_user_file_hash_active_unique" ON "portfolio_import_batches" USING btree ("user_id","file_hash") WHERE "portfolio_import_batches"."status" NOT IN ('completed', 'reverted', 'failed');--> statement-breakpoint
CREATE INDEX "portfolio_import_batches_user_created_at" ON "portfolio_import_batches" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "portfolio_import_batches_worker_ready" ON "portfolio_import_batches" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "portfolio_import_payloads_expiry" ON "portfolio_import_payloads" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "portfolio_import_rows_batch_fingerprint_unique" ON "portfolio_import_rows" USING btree ("batch_id","semantic_fingerprint");--> statement-breakpoint
CREATE INDEX "portfolio_import_rows_user_batch_number" ON "portfolio_import_rows" USING btree ("user_id","batch_id","row_number");--> statement-breakpoint
CREATE INDEX "portfolio_import_rows_user_proposed_asset" ON "portfolio_import_rows" USING btree ("user_id","proposed_asset_id");