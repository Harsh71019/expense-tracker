module.exports = {
  async up(db) {
    await db
      .collection("recurring_rules")
      .createIndex({ userId: 1 }, { name: "recurring_rules_user_id" });
    await db
      .collection("recurring_rules")
      .createIndex(
        { isPaused: 1, nextRunAt: 1 },
        { name: "recurring_rules_is_paused_next_run_at" }
      );
  },
  async down() {
    // Additive-only: the indexes remain safe if this migration is rolled back.
  }
};
