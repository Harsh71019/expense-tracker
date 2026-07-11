module.exports = {
  async up(db) {
    await db
      .collection("user_profiles")
      .createIndex({ userId: 1 }, { unique: true, name: "user_profiles_user_id_unique" });
  },
  async down() {
    // Additive-only: the index remains safe if this migration is rolled back.
  }
};
