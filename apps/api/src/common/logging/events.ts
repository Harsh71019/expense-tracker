export const LogEvent = {
  IdempotencyDuplicate: "idem.duplicate",
  TransactionCreated: "txn.created",
  TransactionReversed: "txn.reversed"
} as const;

export type LogEvent = (typeof LogEvent)[keyof typeof LogEvent];
