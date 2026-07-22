import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { apiKey } from "@better-auth/api-key";
import { Inject, Injectable } from "@nestjs/common";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { RedisService } from "../common/redis/redis.service.js";
import { UserProfileService } from "../user-profiles/user-profile.service.js";
import { createRedisSecondaryStorage } from "./redis-secondary-storage.js";

type AuthLogger = Pick<Logger, "warn">;

export function createAuth(
  db: DrizzleDb,
  config: RuntimeConfigService,
  redis: RedisService,
  profiles: UserProfileService,
  logger: AuthLogger
) {
  return betterAuth({
    baseURL: config.env.BETTER_AUTH_URL,
    secret: config.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg" }),
    secondaryStorage: createRedisSecondaryStorage(redis),
    trustedOrigins: config.trustedOrigins(),
    emailAndPassword: {
      enabled: true,
      disableSignUp: config.env.DISABLE_SIGNUP
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user): Promise<void> => {
            try {
              await profiles.ensure(user.id, user.name);
            } catch (error) {
              logger.warn(
                { error, userId: user.id },
                "User profile creation failed; authentication will retry it."
              );
            }
          }
        }
      }
    },
    advanced: {
      useSecureCookies: config.env.AUTH_COOKIE_SECURE,
      ipAddress: {
        ipAddressHeaders: ["x-real-ip"]
      }
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: "secondary-storage",
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 10 }
      }
    },
    plugins: [
      apiKey({
        references: "user",
        requireName: true,
        defaultPrefix: "ak_",
        keyExpiration: { defaultExpiresIn: null },
        rateLimit: { enabled: true, timeWindow: 60_000, maxRequests: 100 }
      })
    ]
  });
}

export type VyayaAuth = ReturnType<typeof createAuth>;

@Injectable()
export class AuthService {
  readonly auth: VyayaAuth;

  constructor(
    @Inject(DATABASE_CONNECTION) db: DrizzleDb,
    config: RuntimeConfigService,
    redis: RedisService,
    profiles: UserProfileService,
    logger: Logger
  ) {
    this.auth = createAuth(db, config, redis, profiles, logger);
  }
}
