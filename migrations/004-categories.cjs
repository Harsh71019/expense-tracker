module.exports = {
  async up(db) {
    await db
      .collection("categories")
      .createIndex(
        { userId: 1, parentId: 1, name: 1 },
        { unique: true, name: "categories_user_id_parent_id_name_unique" }
      );
  },
  async down() {}
};
