import { z } from "zod";

const portSchema = z.coerce.number().int().min(1).max(65_535);
const booleanStringSchema = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

export const RuntimeEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: portSchema.default(4000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "fatal"]).default("info"),
  SERVICE_ROLE: z.enum(["api", "worker"]).default("api"),
  MONGODB_URI: z.string().url(),
  REDIS_URL: z.string().url(),
  APP_TIMEZONE: z.literal("Asia/Kolkata").default("Asia/Kolkata"),
  TRUSTED_ORIGINS: z.string().min(1),
  GIT_SHA: z.string().min(1).default("development"),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  AUTH_COOKIE_SECURE: booleanStringSchema.default(false),
  DISABLE_SIGNUP: booleanStringSchema.default(false)
});

export type RuntimeEnv = z.infer<typeof RuntimeEnvSchema>;

export function parseRuntimeEnv(environment: NodeJS.ProcessEnv): RuntimeEnv {
  return RuntimeEnvSchema.parse(environment);
}
