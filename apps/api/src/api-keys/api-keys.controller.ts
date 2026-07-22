import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from "@nestjs/common";
import {
  ApiKeyIdSchema,
  CreateApiKeySchema,
  UpdateApiKeySchema,
  type ApiKey,
  type CreateApiKeyResponse
} from "@treasury-ops/shared";
import type { Request } from "express";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { ApiKeysService } from "./api-keys.service.js";

@Controller("v1/api-keys")
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown
  ): Promise<CreateApiKeyResponse> {
    return this.apiKeys.create(user.id, CreateApiKeySchema.parse(body));
  }

  // listApiKeys requires a real better-auth session and resolves session.user.id
  // itself -- it doesn't accept a server-supplied userId the way the other three
  // plugin calls do. Forward the raw request so the plugin re-derives its own
  // session from the original cookie, instead of using @CurrentUser().
  @Get()
  list(@Req() request: Request): Promise<ApiKey[]> {
    return this.apiKeys.list(request);
  }

  @Patch(":keyId")
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("keyId") keyId: string,
    @Body() body: unknown
  ): Promise<ApiKey> {
    return this.apiKeys.update(
      user.id,
      ApiKeyIdSchema.parse(keyId),
      UpdateApiKeySchema.parse(body)
    );
  }

  @Delete(":keyId")
  @HttpCode(204)
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param("keyId") keyId: string
  ): Promise<void> {
    return this.apiKeys.revoke(user.id, ApiKeyIdSchema.parse(keyId));
  }
}
