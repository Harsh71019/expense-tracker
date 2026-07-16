module.exports = {
  async up(db) {
    await db
      .collection("import_batches")
      .createIndex(
        { userId: 1, fileHash: 1 },
        { unique: true, name: "import_batches_user_id_file_hash_unique" }
      );
    await db
      .collection("staged_rows")
      .createIndex({ batchId: 1 }, { name: "staged_rows_batch_id" });
    await db.collection("staged_rows").createIndex(
      { createdAt: 1 },
      {
        name: "staged_rows_created_at_ttl",
        expireAfterSeconds: 7 * 24 * 60 * 60
      }
    );
    await db.collection("transactions").createIndexes([
      {
        key: { userId: 1, dedupeHash: 1 },
        unique: true,
        sparse: true,
        name: "transactions_user_id_dedupe_hash_unique"
      },
      {
        key: { importBatchId: 1 },
        sparse: true,
        name: "transactions_import_batch_id"
      }
    ]);
  },
  async down() {
    // Additive-only: the indexes remain safe if this migration is rolled back.
  }
};
