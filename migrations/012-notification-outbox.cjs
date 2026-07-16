module.exports = {
  async up(db) {
    await db.collection("notification_outbox").createIndexes([
      { key: { status: 1, createdAt: 1 }, name: "notification_outbox_status_created_at" },
      { key: { userId: 1 }, name: "notification_outbox_user_id" }
    ]);
  },
  async down() {
    // Additive-only: the indexes remain safe if this migration is rolled back.
  }
};
