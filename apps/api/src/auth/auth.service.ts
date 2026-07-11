import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { betterAuth } from "better-auth/minimal";
import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";

import { RuntimeConfigService } from "../common/config/runtime-config.service.js";

function createAuth(connection: Connection, config: RuntimeConfigService) {
  const client = connection.getClient();
  return betterAuth({
    baseURL: config.env.BETTER_AUTH_URL,
    secret: config.env.BETTER_AUTH_SECRET,
    database: mongodbAdapter(client.db(), { client }),
    trustedOrigins: config.trustedOrigins(),
    emailAndPassword: {
      enabled: true,
      disableSignUp: config.env.DISABLE_SIGNUP
    },
    advanced: {
      useSecureCookies: config.env.AUTH_COOKIE_SECURE
    }
  });
}

export type VyayaAuth = ReturnType<typeof createAuth>;

@Injectable()
export class AuthService {
  readonly auth: VyayaAuth;

  constructor(@InjectConnection() connection: Connection, config: RuntimeConfigService) {
    this.auth = createAuth(connection, config);
  }
}
