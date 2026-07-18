module.exports = {
  async up(db) {
    await db
      .collection("idempotency_records")
      .createIndex(
        { userId: 1, operation: 1, key: 1 },
        { unique: true, name: "idempotency_records_user_operation_key_unique" }
      );
  },
  async down() {
    // Additive-only: keeping this index is safe on rollback.
  }
};
