module.exports = {
  async up(db) {
    await db.collection("transactions").createIndexes([
      { key: { userId: 1, occurredAt: -1 }, name: "transactions_user_id_occurred_at" },
      {
        key: { userId: 1, accountId: 1, occurredAt: -1 },
        name: "transactions_user_id_account_id_occurred_at"
      },
      {
        key: { userId: 1, categoryId: 1, occurredAt: -1 },
        name: "transactions_user_id_category_id_occurred_at"
      },
      {
        key: { idempotencyKey: 1 },
        unique: true,
        sparse: true,
        name: "transactions_idempotency_key_unique"
      }
    ]);
    await db
      .collection("audit_log")
      .createIndex({ userId: 1, at: -1 }, { name: "audit_log_user_id_at" });
  },
  async down() {}
};
