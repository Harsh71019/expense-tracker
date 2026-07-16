module.exports = {
  async up(db) {
    await db
      .collection("monthly_rollups")
      .createIndex(
        { userId: 1, month: 1 },
        { name: "monthly_rollups_user_id_month", unique: true }
      );
  },
  async down() {
    // Additive-only: the index remains safe if this migration is rolled back.
  }
};
