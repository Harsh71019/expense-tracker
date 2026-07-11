import { Injectable } from "@nestjs/common";

import { parseRuntimeEnv, type RuntimeEnv } from "./env.js";

@Injectable()
export class RuntimeConfigService {
  readonly env: RuntimeEnv;

  constructor() {
    this.env = parseRuntimeEnv(process.env);
  }

  trustedOrigins(): string[] {
    return this.env.TRUSTED_ORIGINS.split(",").map((origin) => origin.trim());
  }
}
