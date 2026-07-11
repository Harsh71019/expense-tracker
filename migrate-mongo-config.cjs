const { z } = require("zod");
const path = require("node:path");

const migrationEnvSchema = z.object({
  MONGODB_URI: z.string().url()
});

const environment = migrationEnvSchema.parse(process.env);

module.exports = {
  mongodb: {
    url: environment.MONGODB_URI,
    options: {}
  },
  migrationsDir: path.resolve(__dirname, "migrations"),
  changelogCollectionName: "changelog",
  migrationFileExtension: ".cjs",
  useFileHash: true,
  moduleSystem: "commonjs"
};
