module.exports = {
  async up(db) {
    await db
      .collection("transactions")
      .createIndex(
        { reversalOf: 1 },
        { unique: true, sparse: true, name: "transactions_reversal_of_unique" }
      );
  },
  async down() {}
};
