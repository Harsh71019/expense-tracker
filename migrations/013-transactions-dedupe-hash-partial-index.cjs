module.exports = {
  async up(db) {
    // Migration 009 shipped `{userId, dedupeHash}` as `sparse: true`, intending
    // to skip manually-created transactions (which never set dedupeHash) from
    // the uniqueness constraint. But sparse is document-wide, not per-field:
    // for a COMPOUND index, MongoDB only excludes a document if ALL indexed
    // fields are missing. userId is always present, so every manual
    // transaction was indexed anyway with dedupeHash treated as null — the
    // first manual transaction per user succeeded, every one after collided
    // on {userId, null} and 500'd. Migration 010 hit and fixed this same
    // sparse-compound-index footgun on import_batches; this repeats that fix
    // here with a partial index scoped to documents that actually set
    // dedupeHash (i.e. CSV-imported rows only).
    await db.collection("transactions").dropIndex("transactions_user_id_dedupe_hash_unique");
    await db.collection("transactions").createIndex(
      { userId: 1, dedupeHash: 1 },
      {
        unique: true,
        partialFilterExpression: { dedupeHash: { $exists: true } },
        name: "transactions_user_id_dedupe_hash_unique"
      }
    );
  },
  async down() {
    // Additive-only: the corrected index remains safe if this migration is
    // rolled back; the down migration does not restore the overly-strict one.
  }
};
