CREATE TYPE "public"."bill_reconciliation_status" AS ENUM('awaiting_statement', 'reconciled');--> statement-breakpoint
CREATE TYPE "public"."bill_statement_row_match_status" AS ENUM('matched', 'missing_from_ledger', 'ambiguous');--> statement-breakpoint
CREATE TYPE "public"."bill_statement_upload_status" AS ENUM('pending', 'staged', 'failed');--> statement-breakpoint
CREATE TABLE "credit_card_bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"cycle_start" timestamp with time zone NOT NULL,
	"cycle_end" timestamp with time zone NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"amount_due_minor" bigint NOT NULL,
	"reconciliation_status" "bill_reconciliation_status" DEFAULT 'awaiting_statement' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "credit_card_bills_amount_nonnegative" CHECK ("credit_card_bills"."amount_due_minor" >= 0),
	CONSTRAINT "credit_card_bills_cycle_order" CHECK ("credit_card_bills"."cycle_start" <= "credit_card_bills"."cycle_end")
);
--> statement-breakpoint
CREATE TABLE "bill_statement_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"upload_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"parsed_occurred_at" timestamp with time zone,
	"parsed_amount_minor" bigint,
	"parsed_type" "transaction_type",
	"parsed_description" text,
	"matched_transaction_id" uuid,
	"match_status" "bill_statement_row_match_status" NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"problems" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_statement_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"bill_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"file_hash" text NOT NULL,
	"mapping" jsonb NOT NULL,
	"status" "bill_statement_upload_status" DEFAULT 'pending' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"stats_total" integer DEFAULT 0 NOT NULL,
	"stats_matched" integer DEFAULT 0 NOT NULL,
	"stats_missing" integer DEFAULT 0 NOT NULL,
	"stats_ambiguous" integer DEFAULT 0 NOT NULL,
	"stats_acknowledged" integer DEFAULT 0 NOT NULL,
	"acknowledged_extra_transaction_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "statement_day" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "due_day" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "next_statement_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "bill_id" uuid;--> statement-breakpoint
ALTER TABLE "credit_card_bills" ADD CONSTRAINT "credit_card_bills_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_card_bills" ADD CONSTRAINT "credit_card_bills_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_statement_rows" ADD CONSTRAINT "bill_statement_rows_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_statement_rows" ADD CONSTRAINT "bill_statement_rows_upload_id_bill_statement_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."bill_statement_uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_statement_rows" ADD CONSTRAINT "bill_statement_rows_matched_transaction_id_transactions_id_fk" FOREIGN KEY ("matched_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_statement_uploads" ADD CONSTRAINT "bill_statement_uploads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_statement_uploads" ADD CONSTRAINT "bill_statement_uploads_bill_id_credit_card_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."credit_card_bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_card_bills_user_account_cycle_unique" ON "credit_card_bills" USING btree ("user_id","account_id","cycle_end");--> statement-breakpoint
CREATE INDEX "credit_card_bills_user_due_cursor" ON "credit_card_bills" USING btree ("user_id","due_date" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "credit_card_bills_user_account_cycle" ON "credit_card_bills" USING btree ("user_id","account_id","cycle_end" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "bill_statement_rows_upload_row_unique" ON "bill_statement_rows" USING btree ("upload_id","row_number");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_statement_rows_upload_match_unique" ON "bill_statement_rows" USING btree ("upload_id","matched_transaction_id") WHERE "bill_statement_rows"."matched_transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "bill_statement_rows_user_upload_cursor" ON "bill_statement_rows" USING btree ("user_id","upload_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "bill_statement_uploads_active_bill_unique" ON "bill_statement_uploads" USING btree ("bill_id") WHERE "bill_statement_uploads"."active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "bill_statement_uploads_user_bill_hash_unique" ON "bill_statement_uploads" USING btree ("user_id","bill_id","file_hash");--> statement-breakpoint
CREATE INDEX "bill_statement_uploads_user_bill_created" ON "bill_statement_uploads" USING btree ("user_id","bill_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bill_id_credit_card_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."credit_card_bills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_bill_id" ON "transactions" USING btree ("bill_id") WHERE "transactions"."bill_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_credit_card_config_complete" CHECK ((
        ("accounts"."statement_day" IS NULL AND "accounts"."due_day" IS NULL AND "accounts"."next_statement_at" IS NULL)
        OR
        (
          "accounts"."statement_day" BETWEEN 1 AND 31
          AND "accounts"."due_day" BETWEEN 1 AND 31
          AND "accounts"."next_statement_at" IS NOT NULL
        )
      ));