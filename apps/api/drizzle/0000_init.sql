CREATE TYPE "public"."account_type" AS ENUM('bank', 'credit_card', 'cash', 'wallet', 'investment');--> statement-breakpoint
CREATE TYPE "public"."asset_kind" AS ENUM('loan_receivable', 'loan_liability', 'fixed_deposit', 'gold', 'silver', 'investment');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('expense', 'income');--> statement-breakpoint
CREATE TYPE "public"."import_batch_status" AS ENUM('pending', 'staged', 'committed', 'reverted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('pending', 'sent');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('budget_alert', 'monthly_report', 'balance_drift');--> statement-breakpoint
CREATE TYPE "public"."transaction_source" AS ENUM('manual', 'csv_import', 'recurring', 'api');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('posted', 'reversed', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('expense', 'income');--> statement-breakpoint
CREATE TYPE "public"."valuation_source" AS ENUM('manual', 'maturity_projection');--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"locale" text DEFAULT 'en-IN' NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"opening_balance_minor" bigint NOT NULL,
	"balance_minor" bigint NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "category_kind" NOT NULL,
	"parent_id" uuid,
	"icon" text,
	"color" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"category_id" uuid,
	"type" "transaction_type" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"source" "transaction_source" NOT NULL,
	"status" "transaction_status" NOT NULL,
	"idempotency_key" uuid,
	"reversal_of" uuid,
	"reversed_by" uuid,
	"transfer_group_id" uuid,
	"import_batch_id" uuid,
	"dedupe_hash" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_id" text NOT NULL,
	"meta" jsonb,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_valuations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"asset_id" uuid NOT NULL,
	"value_minor" bigint NOT NULL,
	"valued_at" timestamp with time zone NOT NULL,
	"source" "valuation_source" NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "net_worth_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"name" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"maturity_at" timestamp with time zone,
	"annual_rate_bps" integer,
	"quantity_milli_units" bigint,
	"is_closed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"file_hash" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"status" "import_batch_status" NOT NULL,
	"stats_total" integer DEFAULT 0 NOT NULL,
	"stats_staged" integer DEFAULT 0 NOT NULL,
	"stats_duplicates" integer DEFAULT 0 NOT NULL,
	"stats_committed" integer DEFAULT 0 NOT NULL,
	"committed_at" timestamp with time zone,
	"reverted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staged_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"parsed_occurred_at" timestamp with time zone,
	"parsed_amount_minor" bigint,
	"parsed_type" "transaction_type",
	"parsed_description" text,
	"dedupe_hash" text,
	"suggested_category_id" uuid,
	"problems" text[] DEFAULT '{}' NOT NULL,
	"is_duplicate" boolean NOT NULL,
	"include" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"pattern" text NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" "notification_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "notification_status" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"user_id" text NOT NULL,
	"operation" text NOT NULL,
	"key" uuid NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "idempotency_records_user_id_operation_key_pk" PRIMARY KEY("user_id","operation","key")
);
--> statement-breakpoint
CREATE TABLE "recurring_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"template_account_id" uuid NOT NULL,
	"template_category_id" uuid,
	"template_type" "transaction_type" NOT NULL,
	"template_amount_minor" bigint NOT NULL,
	"template_description" text NOT NULL,
	"template_tags" text[] DEFAULT '{}' NOT NULL,
	"rrule" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"is_paused" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_rollups" (
	"user_id" text NOT NULL,
	"month" text NOT NULL,
	"by_category" jsonb NOT NULL,
	"by_account" jsonb NOT NULL,
	"total_expense_minor" bigint NOT NULL,
	"total_income_minor" bigint NOT NULL,
	"computed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "monthly_rollups_user_id_month_pk" PRIMARY KEY("user_id","month")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_valuations" ADD CONSTRAINT "asset_valuations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_valuations" ADD CONSTRAINT "asset_valuations_asset_id_net_worth_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."net_worth_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_worth_assets" ADD CONSTRAINT "net_worth_assets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_rows" ADD CONSTRAINT "staged_rows_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_rows" ADD CONSTRAINT "staged_rows_suggested_category_id_categories_id_fk" FOREIGN KEY ("suggested_category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_template_account_id_accounts_id_fk" FOREIGN KEY ("template_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_template_category_id_categories_id_fk" FOREIGN KEY ("template_category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_rollups" ADD CONSTRAINT "monthly_rollups_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_id_name_unique" ON "accounts" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_id_parent_id_name_unique" ON "categories" USING btree ("user_id","parent_id","name");--> statement-breakpoint
CREATE INDEX "transactions_user_id_occurred_at" ON "transactions" USING btree ("user_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transactions_user_id_account_id_occurred_at" ON "transactions" USING btree ("user_id","account_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "transactions_user_id_category_id_occurred_at" ON "transactions" USING btree ("user_id","category_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_idempotency_key_unique" ON "transactions" USING btree ("idempotency_key") WHERE "transactions"."idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_reversal_of_unique" ON "transactions" USING btree ("reversal_of") WHERE "transactions"."reversal_of" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "transactions_transfer_group_id" ON "transactions" USING btree ("transfer_group_id") WHERE "transactions"."transfer_group_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_user_id_dedupe_hash_unique" ON "transactions" USING btree ("user_id","dedupe_hash") WHERE "transactions"."dedupe_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "transactions_import_batch_id" ON "transactions" USING btree ("import_batch_id") WHERE "transactions"."import_batch_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "audit_log_user_id_at" ON "audit_log" USING btree ("user_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "asset_valuations_user_id_asset_id_valued_at" ON "asset_valuations" USING btree ("user_id","asset_id","valued_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "net_worth_assets_user_id_is_closed" ON "net_worth_assets" USING btree ("user_id","is_closed");--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_user_id_file_hash_committed_unique" ON "import_batches" USING btree ("user_id","file_hash") WHERE "import_batches"."status" = 'committed';--> statement-breakpoint
CREATE INDEX "staged_rows_batch_id" ON "staged_rows" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "staged_rows_created_at" ON "staged_rows" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "category_rules_user_id" ON "category_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_outbox_status_created_at" ON "notification_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_user_id" ON "notification_outbox" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recurring_rules_user_id" ON "recurring_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recurring_rules_is_paused_next_run_at" ON "recurring_rules" USING btree ("is_paused","next_run_at");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");