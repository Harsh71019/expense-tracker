module.exports = {
  async up(db) {
    // Migration 009 shipped a blanket unique index on {userId, fileHash},
    // which blocks re-uploading the same statement after its batch was
    // reverted — but IMPLEMENTATION-PLAN.md's Gate 3 explicitly requires
    // "revert the whole batch ... re-import -> clean". BACKEND.md's actual
    // rule is narrower: "reject if fileHash already committed." Replace the
    // blanket unique index with a partial one scoped to committed batches
    // only, so staged/reverted/failed attempts at the same file never block
    // a fresh upload.
    await db.collection("import_batches").dropIndex("import_batches_user_id_file_hash_unique");
    await db.collection("import_batches").createIndex(
      { userId: 1, fileHash: 1 },
      {
        unique: true,
        partialFilterExpression: { status: "committed" },
        name: "import_batches_user_id_file_hash_committed_unique"
      }
    );
  },
  async down() {
    // Additive-only: the corrected index remains safe if this migration is
    // rolled back; the down migration does not restore the overly-strict one.
  }
};
