import type { ApiKeyPermissions } from "@treasury-ops/shared";

export const SCOPE_OPTIONS = [
  {
    id: "transactions-write",
    label: "Create transactions",
    resource: "transactions",
    action: "write"
  },
  { id: "categories-read", label: "Read categories", resource: "categories", action: "read" },
  { id: "accounts-read", label: "Read accounts", resource: "accounts", action: "read" }
] as const;

export function scopeIdsToPermissions(ids: ReadonlySet<string>): ApiKeyPermissions {
  const permissions: Record<string, string[]> = {};
  for (const option of SCOPE_OPTIONS) {
    if (ids.has(option.id)) {
      permissions[option.resource] = [option.action];
    }
  }
  return permissions;
}

function getPermissionsForResource(
  permissions: ApiKeyPermissions,
  resource: string
): readonly string[] | undefined {
  if (resource === "transactions") {
    return permissions.transactions;
  }
  if (resource === "categories") {
    return permissions.categories;
  }
  if (resource === "accounts") {
    return permissions.accounts;
  }
  return undefined;
}

export function permissionsToScopeIds(permissions: ApiKeyPermissions | null): ReadonlySet<string> {
  const ids = new Set<string>();
  if (!permissions) return ids;
  for (const option of SCOPE_OPTIONS) {
    const actions = getPermissionsForResource(permissions, option.resource);
    if (actions?.includes(option.action)) {
      ids.add(option.id);
    }
  }
  return ids;
}

export function scopeLabels(permissions: ApiKeyPermissions | null): string[] {
  if (!permissions) return [];
  return SCOPE_OPTIONS.filter((option) => {
    const actions = getPermissionsForResource(permissions, option.resource);
    return actions?.includes(option.action);
  }).map((option) => option.label);
}
