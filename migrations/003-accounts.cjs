module.exports = {
  async up(db) {
    await db
      .collection("accounts")
      .createIndex({ userId: 1, name: 1 }, { unique: true, name: "accounts_user_id_name_unique" });
  },
  async down() {
    // Additive-only: the index remains safe if this migration is rolled back.
  }
};
