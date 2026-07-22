import type { ApiKeyPermissions } from "@treasury-ops/shared";
import { describe, expect, it } from "vitest";

import { permissionsToScopeIds, scopeIdsToPermissions, scopeLabels } from "./scopes";

describe("scopeIdsToPermissions", () => {
  it("builds a permissions object from selected scope ids", () => {
    const permissions = scopeIdsToPermissions(new Set(["transactions-write", "accounts-read"]));
    expect(permissions).toEqual({ transactions: ["write"], accounts: ["read"] });
  });

  it("returns an empty object for no selection", () => {
    expect(scopeIdsToPermissions(new Set())).toEqual({});
  });
});

describe("permissionsToScopeIds", () => {
  it("round-trips through scopeIdsToPermissions", () => {
    const ids = new Set(["categories-read"]);
    expect(permissionsToScopeIds(scopeIdsToPermissions(ids))).toEqual(ids);
  });

  it("returns an empty set for null permissions", () => {
    expect(permissionsToScopeIds(null)).toEqual(new Set());
  });
});

describe("scopeLabels", () => {
  it("returns human-readable labels for the selected scopes", () => {
    const permissions: ApiKeyPermissions = { transactions: ["write"], categories: ["read"] };
    expect(scopeLabels(permissions)).toEqual(["Create transactions", "Read categories"]);
  });

  it("returns an empty array for null permissions", () => {
    expect(scopeLabels(null)).toEqual([]);
  });
});
