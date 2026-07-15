export const LogEvent = {
  IdempotencyDuplicate: "idem.duplicate",
  TransactionCreated: "txn.created",
  TransactionReversed: "txn.reversed",
  TransactionUpdated: "txn.updated",
  TransferCreated: "transfer.created",
  TransferReversed: "transfer.reversed"
} as const;

export type LogEvent = (typeof LogEvent)[keyof typeof LogEvent];
