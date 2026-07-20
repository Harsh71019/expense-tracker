import { describe, expect, it } from "vitest";

import { ApiKeyPermissionsSchema, CreateApiKeySchema } from "./api-key.js";

describe("ApiKeyPermissionsSchema", () => {
  it("accepts a permissions object using only known resource/action pairs", () => {
    const result = ApiKeyPermissionsSchema.safeParse({
      transactions: ["write"],
      categories: ["read"]
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown action for a known resource", () => {
    const result = ApiKeyPermissionsSchema.safeParse({ transactions: ["delete"] });
    expect(result.success).toBe(false);
  });

  it("rejects an empty permissions object", () => {
    const result = ApiKeyPermissionsSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("CreateApiKeySchema", () => {
  it("requires a non-empty name and at least one scope", () => {
    const result = CreateApiKeySchema.safeParse({
      name: "n8n",
      permissions: { transactions: ["write"] }
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing name", () => {
    const result = CreateApiKeySchema.safeParse({ permissions: { transactions: ["write"] } });
    expect(result.success).toBe(false);
  });
});
