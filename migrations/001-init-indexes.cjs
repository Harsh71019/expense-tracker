module.exports = {
  async up() {
    // Deliberately empty: proves the migration pipeline before live collections exist.
  },
  async down() {
    // Phase 0 migrations are additive-only and require no rollback action.
  }
};
