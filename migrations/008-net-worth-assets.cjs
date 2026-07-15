module.exports = {
  async up(db) {
    await db
      .collection("net_worth_assets")
      .createIndex({ userId: 1, isClosed: 1 }, { name: "net_worth_assets_user_id_is_closed" });
    await db
      .collection("asset_valuations")
      .createIndex(
        { userId: 1, assetId: 1, valuedAt: -1 },
        { name: "asset_valuations_user_id_asset_id_valued_at" }
      );
  },
  async down() {
    // Additive-only: the indexes remain safe if this migration is rolled back.
  }
};
