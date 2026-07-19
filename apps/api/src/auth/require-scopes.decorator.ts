import { SetMetadata } from "@nestjs/common";

export const REQUIRE_SCOPES_KEY = "requireScopes";

export type ApiKeyScopes = Readonly<Record<string, readonly string[]>>;

export const RequireScopes = (scopes: ApiKeyScopes): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_SCOPES_KEY, scopes);
