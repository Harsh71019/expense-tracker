CREATE TYPE "public"."pending_transaction_status" AS ENUM('pending', 'confirmed', 'dismissed');--> statement-breakpoint
CREATE TABLE "pending_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"type" "transaction_type" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"description" text NOT NULL,
	"status" "pending_transaction_status" NOT NULL,
	"resulting_transaction_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pending_transactions" ADD CONSTRAINT "pending_transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_transactions" ADD CONSTRAINT "pending_transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_transactions" ADD CONSTRAINT "pending_transactions_resulting_transaction_id_transactions_id_fk" FOREIGN KEY ("resulting_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_transactions_user_id_status" ON "pending_transactions" USING btree ("user_id","status");