import { Injectable } from "@nestjs/common";
import { fromNodeHeaders } from "better-auth/node";
import type {
  ApiKey,
  ApiKeyPermissions,
  CreateApiKey,
  CreateApiKeyResponse,
  UpdateApiKey
} from "@treasury-ops/shared";
import type { Request } from "express";

import { AuthService } from "../auth/auth.service.js";

type PluginApiKey = Readonly<{
  id: string;
  name: string | null;
  start: string | null;
  permissions: Record<string, string[]> | null;
  enabled: boolean;
  createdAt: Date;
  expiresAt: Date | null;
  lastRequest: Date | null;
}>;

@Injectable()
export class ApiKeysService {
  constructor(private readonly authService: AuthService) {}

  async create(userId: string, input: CreateApiKey): Promise<CreateApiKeyResponse> {
    const created = await this.authService.auth.api.createApiKey({
      body: {
        userId,
        name: input.name,
        permissions: toPluginPermissions(input.permissions),
        prefix: "ak_",
        ...(input.expiresAt === undefined ? {} : { expiresIn: secondsUntil(input.expiresAt) })
      }
    });

    return { ...toApiKey(created), key: created.key };
  }

  async list(request: Request): Promise<ApiKey[]> {
    const { apiKeys } = await this.authService.auth.api.listApiKeys({
      headers: fromNodeHeaders(request.headers)
    });
    return apiKeys.map(toApiKey);
  }

  async update(userId: string, keyId: string, input: UpdateApiKey): Promise<ApiKey> {
    const { permissions, ...rest } = input;
    const updated = await this.authService.auth.api.updateApiKey({
      body: {
        keyId,
        userId,
        ...rest,
        ...(permissions === undefined ? {} : { permissions: toPluginPermissions(permissions) })
      }
    });
    return toApiKey(updated);
  }

  async revoke(userId: string, keyId: string): Promise<void> {
    await this.authService.auth.api.updateApiKey({
      body: { keyId, userId, enabled: false }
    });
  }
}

function secondsUntil(date: Date): number {
  return Math.max(1, Math.floor((date.getTime() - Date.now()) / 1000));
}

// The plugin's zod schema requires a plain Record<string, string[]> (no optional/undefined
// values), while ApiKeyPermissions has each scope as an optional key. Drop undefined entries
// rather than casting so the result is structurally exact for the installed types.
function toPluginPermissions(permissions: ApiKeyPermissions): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(permissions)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function toApiKey(key: PluginApiKey): ApiKey {
  return {
    id: key.id,
    name: key.name ?? "",
    start: key.start,
    permissions: key.permissions,
    enabled: key.enabled,
    createdAt: key.createdAt,
    expiresAt: key.expiresAt,
    lastRequest: key.lastRequest
  };
}
