INSERT INTO "asset_position_events" (
  "id",
  "user_id",
  "asset_id",
  "event_type",
  "quantity_micro_units",
  "occurred_at",
  "source",
  "source_reference",
  "created_at"
)
SELECT
  gen_random_uuid(),
  asset."user_id",
  asset."id",
  'opening',
  asset."quantity_milli_units" * 1000,
  asset."opened_at",
  'legacy_backfill',
  'legacy-metal-position:' || asset."id"::text,
  CURRENT_TIMESTAMP
FROM "net_worth_assets" AS asset
WHERE asset."kind" IN ('gold', 'silver')
  AND asset."quantity_milli_units" IS NOT NULL
  AND asset."quantity_milli_units" > 0
  AND NOT EXISTS (
    SELECT 1
    FROM "asset_position_events" AS event
    WHERE event."user_id" = asset."user_id"
      AND event."asset_id" = asset."id"
  );
