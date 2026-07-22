import { Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";

import { AuthService } from "./auth.service.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";
import { REQUIRE_SCOPES_KEY } from "./require-scopes.decorator.js";
import type { ApiKeyScopes } from "./require-scopes.decorator.js";
import { InsufficientScopeError } from "../common/errors/insufficient-scope.error.js";
import { RateLimitedError } from "../common/errors/rate-limited.error.js";
import { UnauthenticatedError } from "../common/errors/unauthenticated.error.js";
import { LoggingContextService } from "../common/logging/logging-context.service.js";
import { UserProfileService } from "../user-profiles/user-profile.service.js";

export type AuthenticatedUser = Readonly<{ id: string }>;

type VerifiedApiKey = Readonly<{
  id: string;
  referenceId: string;
  prefix: string | null;
  permissions: Readonly<Record<string, readonly string[]>> | null;
}>;

type VerifyApiKeyResult = Readonly<{
  valid: boolean;
  error: Readonly<{ code?: string; details?: Readonly<{ tryAgainIn?: number }> }> | null;
  key: VerifiedApiKey | null;
}>;

const DEFAULT_RETRY_AFTER_MS = 60_000;

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly profiles: UserProfileService,
    private readonly reflector: Reflector,
    private readonly loggingContext: LoggingContextService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const bearerKey = extractBearerKey(request.headers.authorization);

    if (bearerKey !== undefined) {
      const requiredScopes = this.reflector.getAllAndOverride<ApiKeyScopes | undefined>(
        REQUIRE_SCOPES_KEY,
        [context.getHandler(), context.getClass()]
      );
      if (requiredScopes === undefined) {
        throw new InsufficientScopeError();
      }
      await this.authenticateApiKey(bearerKey, requiredScopes, request);
      return true;
    }

    const session = await this.authService.auth.api.getSession({
      headers: fromNodeHeaders(request.headers)
    });

    if (session === null) {
      throw new UnauthenticatedError();
    }

    await this.profiles.ensure(session.user.id, session.user.name);
    this.loggingContext.set({ userId: session.user.id });
    request.authUser = { id: session.user.id };
    request.authMethod = "session";
    return true;
  }

  private async authenticateApiKey(
    key: string,
    requiredScopes: ApiKeyScopes,
    request: Request
  ): Promise<void> {
    // `permissions` is deliberately NOT passed to verifyApiKey -- the plugin's own
    // permission check (confirmed in its installed source) throws the exact same
    // error.code, KEY_NOT_FOUND, whether the key is invalid or merely under-scoped,
    // by design (denies a probing attacker an oracle for "real key, wrong scope" vs
    // "fake key"). We check basic validity here, then compare the key's own
    // `permissions` against the route's required scopes ourselves, below, so an
    // under-scoped-but-real key gets a genuine 403 instead of an indistinguishable 401.
    const response = await this.authService.auth.api.verifyApiKey({
      body: { key }
    });
    const result = parseVerifyApiKeyResult(response);

    if (result.error?.code === "RATE_LIMITED") {
      const tryAgainInMs = result.error.details?.tryAgainIn ?? DEFAULT_RETRY_AFTER_MS;
      throw new RateLimitedError(Math.ceil(tryAgainInMs / 1000));
    }
    if (!result.valid || result.key === null) {
      throw new UnauthenticatedError();
    }
    if (!hasRequiredScopes(result.key.permissions, requiredScopes)) {
      throw new InsufficientScopeError();
    }

    request.authUser = { id: result.key.referenceId };
    request.authMethod = "api-key";
    this.loggingContext.set({
      userId: result.key.referenceId,
      apiKeyId: result.key.id,
      ...(result.key.prefix === null ? {} : { apiKeyPrefix: result.key.prefix })
    });
  }
}

function extractBearerKey(header: string | undefined): string | undefined {
  if (header === undefined || !header.startsWith("Bearer ")) return undefined;
  const key = header.slice("Bearer ".length).trim();
  return key.length > 0 ? key : undefined;
}

function hasRequiredScopes(
  granted: Readonly<Record<string, readonly string[]>> | null,
  required: ApiKeyScopes
): boolean {
  if (granted === null) return false;
  return Object.entries(required).every(([resource, actions]) =>
    actions.every((action) => granted[resource]?.includes(action) === true)
  );
}

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

// The real `verifyApiKey` return type doesn't structurally match `VerifyApiKeyResult`
// closely enough for a plain assignment, and this repo bans `as` assertions
// (@typescript-eslint/consistent-type-assertions, assertionStyle: "never"), so we
// narrow the unknown response with a runtime-validating parse instead of casting.
function parseVerifyApiKeyResult(value: unknown): VerifyApiKeyResult {
  if (!isRecord(value)) {
    return { valid: false, error: null, key: null };
  }
  return {
    valid: typeof value.valid === "boolean" ? value.valid : false,
    error: parseVerifyApiKeyError(value.error),
    key: parseVerifiedApiKey(value.key)
  };
}

function parseVerifyApiKeyError(value: unknown): VerifyApiKeyResult["error"] {
  if (!isRecord(value)) {
    return null;
  }
  return {
    ...(typeof value.code === "string" ? { code: value.code } : {}),
    ...(isRecord(value.details) && typeof value.details.tryAgainIn === "number"
      ? { details: { tryAgainIn: value.details.tryAgainIn } }
      : {})
  };
}

function parseVerifiedApiKey(value: unknown): VerifiedApiKey | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.referenceId !== "string") {
    return null;
  }
  return {
    id: value.id,
    referenceId: value.referenceId,
    prefix: typeof value.prefix === "string" ? value.prefix : null,
    permissions: parsePermissions(value.permissions)
  };
}

function parsePermissions(value: unknown): Readonly<Record<string, readonly string[]>> | null {
  if (!isRecord(value)) {
    return null;
  }
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string[]] =>
      Array.isArray(entry[1]) && entry[1].every((item) => typeof item === "string")
  );
  return Object.fromEntries(entries);
}
