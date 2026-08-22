CREATE TYPE "public"."receivable_event_kind" AS ENUM('opening', 'repayment', 'correction_increase', 'correction_decrease', 'legacy_increase', 'legacy_decrease');--> statement-breakpoint
CREATE TYPE "public"."transaction_purpose" AS ENUM('ordinary', 'receivable_principal');--> statement-breakpoint
CREATE TABLE "receivable_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"receivable_id" uuid NOT NULL,
	"kind" "receivable_event_kind" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"transaction_id" uuid,
	"legacy_valuation_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "receivable_events_amount_minor_safe_integer" CHECK ("receivable_events"."amount_minor" between 1 and 9007199254740991),
	CONSTRAINT "receivable_events_correction_requires_reason" CHECK (("receivable_events"."kind" NOT IN ('correction_increase', 'correction_decrease')) OR ("receivable_events"."reason" IS NOT NULL)),
	CONSTRAINT "receivable_events_legacy_increase_requires_legacy_valuation" CHECK (("receivable_events"."kind" <> 'legacy_increase') OR ("receivable_events"."legacy_valuation_id" IS NOT NULL)),
	CONSTRAINT "receivable_events_non_legacy_excludes_legacy_valuation" CHECK (("receivable_events"."kind" IN ('legacy_increase', 'legacy_decrease')) OR ("receivable_events"."legacy_valuation_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "receivables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"counterparty_name" text NOT NULL,
	"note" text,
	"opened_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone,
	"legacy_asset_id" uuid,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "purpose" "transaction_purpose" DEFAULT 'ordinary' NOT NULL;--> statement-breakpoint
ALTER TABLE "receivable_events" ADD CONSTRAINT "receivable_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_events" ADD CONSTRAINT "receivable_events_receivable_id_receivables_id_fk" FOREIGN KEY ("receivable_id") REFERENCES "public"."receivables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_events" ADD CONSTRAINT "receivable_events_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_events" ADD CONSTRAINT "receivable_events_legacy_valuation_id_asset_valuations_id_fk" FOREIGN KEY ("legacy_valuation_id") REFERENCES "public"."asset_valuations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_legacy_asset_id_net_worth_assets_id_fk" FOREIGN KEY ("legacy_asset_id") REFERENCES "public"."net_worth_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "receivable_events_transaction_id_unique" ON "receivable_events" USING btree ("transaction_id") WHERE "receivable_events"."transaction_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "receivable_events_legacy_valuation_id_unique" ON "receivable_events" USING btree ("legacy_valuation_id") WHERE "receivable_events"."legacy_valuation_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "receivable_events_user_id_receivable_id_occurred_at" ON "receivable_events" USING btree ("user_id","receivable_id","occurred_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "receivables_user_id_created_at" ON "receivables" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "receivables_user_id_due_at" ON "receivables" USING btree ("user_id","due_at") WHERE "receivables"."due_at" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "receivables_legacy_asset_id_unique" ON "receivables" USING btree ("legacy_asset_id") WHERE "receivables"."legacy_asset_id" IS NOT NULL;--> statement-breakpoint
-- Additive, idempotent backfill: migrates every legacy `loan_receivable`
-- asset (open or closed) into the new receivables sub-ledger, per plan doc
-- §13.1. Legacy asset/valuation rows are left untouched (rollback safety);
-- this only inserts new receivables/receivable_events rows. Guarded by the
-- unique legacy_asset_id/legacy_valuation_id indexes above, so re-running
-- this migration (or a future corrective migration reusing this shape) is
-- always a no-op once a given asset has been migrated.
DO $$
DECLARE
  asset_record RECORD;
  valuation_record RECORD;
  new_receivable_id uuid;
  running_balance bigint;
  prev_balance bigint;
  delta bigint;
  max_safe_integer CONSTANT bigint := 9007199254740991;
BEGIN
  FOR asset_record IN
    SELECT * FROM net_worth_assets WHERE kind = 'loan_receivable' ORDER BY id
  LOOP
    IF EXISTS (SELECT 1 FROM receivables WHERE legacy_asset_id = asset_record.id) THEN
      CONTINUE;
    END IF;

    new_receivable_id := gen_random_uuid();

    INSERT INTO receivables (
      id, user_id, counterparty_name, note, opened_at, due_at,
      legacy_asset_id, created_at, updated_at
    ) VALUES (
      new_receivable_id, asset_record.user_id, asset_record.name, NULL,
      asset_record.opened_at, NULL, asset_record.id, asset_record.created_at,
      asset_record.updated_at
    );

    running_balance := 0;
    prev_balance := 0;

    FOR valuation_record IN
      SELECT * FROM asset_valuations
      WHERE asset_id = asset_record.id
      ORDER BY valued_at ASC, id ASC
    LOOP
      IF valuation_record.value_minor < 0 THEN
        RAISE EXCEPTION 'receivable migration: negative valuation % on asset % (valuation %)',
          valuation_record.value_minor, asset_record.id, valuation_record.id;
      END IF;
      IF valuation_record.value_minor > max_safe_integer THEN
        RAISE EXCEPTION 'receivable migration: unsafe-integer valuation % on asset % (valuation %)',
          valuation_record.value_minor, asset_record.id, valuation_record.id;
      END IF;

      delta := valuation_record.value_minor - prev_balance;

      IF delta > 0 THEN
        INSERT INTO receivable_events (
          id, user_id, receivable_id, kind, amount_minor, occurred_at,
          legacy_valuation_id, created_at
        ) VALUES (
          gen_random_uuid(), asset_record.user_id, new_receivable_id, 'legacy_increase',
          delta, valuation_record.valued_at, valuation_record.id, valuation_record.created_at
        );
        running_balance := running_balance + delta;
      ELSIF delta < 0 THEN
        IF running_balance + delta < 0 THEN
          RAISE EXCEPTION 'receivable migration: valuation delta would drive asset % negative (valuation %)',
            asset_record.id, valuation_record.id;
        END IF;
        INSERT INTO receivable_events (
          id, user_id, receivable_id, kind, amount_minor, occurred_at,
          legacy_valuation_id, created_at
        ) VALUES (
          gen_random_uuid(), asset_record.user_id, new_receivable_id, 'legacy_decrease',
          -delta, valuation_record.valued_at, valuation_record.id, valuation_record.created_at
        );
        running_balance := running_balance + delta;
      END IF;
      -- delta = 0: skip, per plan doc §13.1 step 6.

      prev_balance := valuation_record.value_minor;
    END LOOP;

    IF asset_record.is_closed AND running_balance > 0 THEN
      INSERT INTO receivable_events (
        id, user_id, receivable_id, kind, amount_minor, occurred_at, created_at
      ) VALUES (
        gen_random_uuid(), asset_record.user_id, new_receivable_id, 'legacy_decrease',
        running_balance, asset_record.updated_at, asset_record.updated_at
      );
    END IF;
  END LOOP;
END $$;