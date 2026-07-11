import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { betterAuth } from "better-auth/minimal";
import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";
import { Logger } from "nestjs-pino";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";
import { RedisService } from "../common/redis/redis.service.js";
import { UserProfileService } from "../user-profiles/user-profile.service.js";
import { createRedisSecondaryStorage } from "./redis-secondary-storage.js";

function createAuth(
  connection: Connection,
  config: RuntimeConfigService,
  redis: RedisService,
  profiles: UserProfileService,
  logger: Logger
) {
  const client = connection.getClient();
  return betterAuth({
    baseURL: config.env.BETTER_AUTH_URL,
    secret: config.env.BETTER_AUTH_SECRET,
    database: mongodbAdapter(client.db(), { client }),
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
    }
  });
}

export type VyayaAuth = ReturnType<typeof createAuth>;

@Injectable()
export class AuthService {
  readonly auth: VyayaAuth;

  constructor(
    @InjectConnection() connection: Connection,
    config: RuntimeConfigService,
    redis: RedisService,
    profiles: UserProfileService,
    logger: Logger
  ) {
    this.auth = createAuth(connection, config, redis, profiles, logger);
  }
}
