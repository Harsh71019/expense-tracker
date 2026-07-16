module.exports = {
  async up(db) {
    await db
      .collection("category_rules")
      .createIndex({ userId: 1 }, { name: "category_rules_user_id" });
  },
  async down() {
    // Additive-only: the index remains safe if this migration is rolled back.
  }
};
