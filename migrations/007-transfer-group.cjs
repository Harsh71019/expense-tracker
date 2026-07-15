module.exports = {
  async up(db) {
    await db
      .collection("transactions")
      .createIndex(
        { transferGroupId: 1 },
        { sparse: true, name: "transactions_transfer_group_id" }
      );
  },
  async down() {}
};
