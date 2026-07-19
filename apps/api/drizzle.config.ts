import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./src/common/db/schema/index.ts", "./src/common/db/auth-schema.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://vyaya:local-dev-password@localhost:5433/vyaya"
  }
});
