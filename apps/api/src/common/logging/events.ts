export const LogEvent = {
  IdempotencyDuplicate: "idem.duplicate",
  TransactionCreated: "txn.created",
  TransactionReversed: "txn.reversed",
  TransactionUpdated: "txn.updated",
  TransferCreated: "transfer.created",
  TransferReversed: "transfer.reversed",
  ImportBatchParsed: "import.batch_parsed",
  ImportBatchParseFailed: "import.batch_parse_failed",
  NotificationDelivered: "notification.delivered",
  NotificationDeliveryFailed: "notification.delivery_failed",
  NotificationSweepEnqueued: "notification.sweep_enqueued",
  RecurringMaterialized: "recurring.materialized",
  RecurringMaterializeFailed: "recurring.materialize_failed",
  RollupsRefreshed: "rollups.refreshed",
  RollupRefreshFailed: "rollups.refresh_failed"
} as const;

export type LogEvent = (typeof LogEvent)[keyof typeof LogEvent];
