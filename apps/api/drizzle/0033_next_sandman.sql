CREATE TYPE "public"."asset_funding_status" AS ENUM('posted', 'reversed', 'reversal');--> statement-breakpoint
CREATE TABLE "asset_fundings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"asset_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"status" "asset_funding_status" NOT NULL,
	"reversal_of" uuid,
	"reversed_by" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "asset_fundings_amount_positive" CHECK ("asset_fundings"."amount_minor" > 0),
	CONSTRAINT "asset_fundings_lifecycle_valid" CHECK (("asset_fundings"."status" = 'posted' AND "asset_fundings"."reversal_of" IS NULL AND "asset_fundings"."reversed_by" IS NULL) OR ("asset_fundings"."status" = 'reversed' AND "asset_fundings"."reversal_of" IS NULL AND "asset_fundings"."reversed_by" IS NOT NULL) OR ("asset_fundings"."status" = 'reversal' AND "asset_fundings"."reversal_of" IS NOT NULL AND "asset_fundings"."reversed_by" IS NULL)),
	CONSTRAINT "asset_fundings_no_self_reversal" CHECK ("asset_fundings"."reversal_of" IS NULL OR "asset_fundings"."reversal_of" <> "asset_fundings"."id")
);
--> statement-breakpoint
ALTER TABLE "asset_fundings" ADD CONSTRAINT "asset_fundings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_fundings" ADD CONSTRAINT "asset_fundings_asset_id_net_worth_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."net_worth_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_fundings" ADD CONSTRAINT "asset_fundings_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_fundings" ADD CONSTRAINT "asset_fundings_reversal_of_asset_fundings_id_fk" FOREIGN KEY ("reversal_of") REFERENCES "public"."asset_fundings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_fundings" ADD CONSTRAINT "asset_fundings_reversed_by_asset_fundings_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."asset_fundings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_fundings_active_source_unique" ON "asset_fundings" USING btree ("user_id","transaction_id") WHERE "asset_fundings"."status" = 'posted';--> statement-breakpoint
CREATE UNIQUE INDEX "asset_fundings_reversal_of_unique" ON "asset_fundings" USING btree ("reversal_of") WHERE "asset_fundings"."reversal_of" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_fundings_reversed_by_unique" ON "asset_fundings" USING btree ("reversed_by") WHERE "asset_fundings"."reversed_by" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "asset_fundings_user_asset_occurred_at_id" ON "asset_fundings" USING btree ("user_id","asset_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "asset_fundings_user_transaction" ON "asset_fundings" USING btree ("user_id","transaction_id");