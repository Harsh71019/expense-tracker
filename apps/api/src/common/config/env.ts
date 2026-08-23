import { z } from "zod";

const portSchema = z.coerce.number().int().min(1).max(65_535);
const positiveMillisecondsSchema = z.coerce.number().int().min(100).max(300_000);
const booleanStringSchema = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

export const RuntimeEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: portSchema.default(4000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "fatal"]).default("info"),
  LOG_PRETTY: booleanStringSchema.default(false),
  SEQ_URL: z.string().url().optional(),
  SEQ_API_KEY: z.string().min(1).optional(),
  SERVICE_ROLE: z.enum(["api", "worker"]).default("api"),
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_CONNECTION_TIMEOUT_MS: positiveMillisecondsSchema.default(5_000),
  DATABASE_QUERY_TIMEOUT_MS: positiveMillisecondsSchema.default(10_000),
  DATABASE_STATEMENT_TIMEOUT_MS: positiveMillisecondsSchema.default(10_000),
  DATABASE_LOCK_TIMEOUT_MS: positiveMillisecondsSchema.default(5_000),
  DATABASE_IDLE_IN_TXN_TIMEOUT_MS: positiveMillisecondsSchema.default(30_000),
  REDIS_URL: z.string().url(),
  READINESS_TIMEOUT_MS: positiveMillisecondsSchema.default(2_000),
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: positiveMillisecondsSchema.default(15_000),
  APP_TIMEZONE: z.literal("Asia/Kolkata").default("Asia/Kolkata"),
  TRUSTED_ORIGINS: z.string().min(1),
  GIT_SHA: z.string().min(1).default("development"),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  AUTH_COOKIE_SECURE: booleanStringSchema.default(false),
  DISABLE_SIGNUP: booleanStringSchema.default(false),
  DISABLE_RATE_LIMITING: booleanStringSchema.default(false)
});

export type RuntimeEnv = z.infer<typeof RuntimeEnvSchema>;

export function parseRuntimeEnv(environment: NodeJS.ProcessEnv): RuntimeEnv {
  return RuntimeEnvSchema.parse(environment);
}
