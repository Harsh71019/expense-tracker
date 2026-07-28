import type { CategoryRule } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import { CategoryRuleMutationService } from "../category-rule-mutation.service.js";

const CATEGORY_ID = "123e4567-e89b-42d3-a456-426614174000";
const RULE_ID = "223e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-01T00:00:00.000Z");
const RULE: CategoryRule = {
  id: RULE_ID,
  userId: "u1",
  pattern: "coffee",
  categoryId: CATEGORY_ID,
  createdAt: NOW,
  updatedAt: NOW
};

function createService(rules: object, categories: object) {
  const tx = {};
  const idempotency = {
    execute: vi.fn(
      async (
        _userId: string,
        _operation: string,
        _key: string,
        _intent: unknown,
        _schema: unknown,
        work: (value: object) => Promise<unknown>
      ) => ({ result: await work(tx), replayed: false })
    )
  };
  // @ts-expect-error - focused collaborators implement the exercised operations.
  return { service: new CategoryRuleMutationService(rules, categories, idempotency), tx };
}

describe("CategoryRuleMutationService", () => {
  it("creates and deletes rules through idempotency", async () => {
    const rules = {
      create: vi.fn().mockResolvedValue(RULE),
      delete: vi.fn().mockResolvedValue(true)
    };
    const categories = { exists: vi.fn().mockResolvedValue(true) };
    const context = createService(rules, categories);

    await expect(
      context.service.create("u1", { pattern: "coffee", categoryId: CATEGORY_ID }, "key-1")
    ).resolves.toMatchObject({ result: RULE });
    await expect(context.service.delete("u1", RULE_ID, "key-2")).resolves.toMatchObject({
      result: null
    });
    expect(rules.create).toHaveBeenCalledWith(
      "u1",
      { pattern: "coffee", categoryId: CATEGORY_ID },
      context.tx
    );
    expect(rules.delete).toHaveBeenCalledWith("u1", RULE_ID, context.tx);
  });

  it("rejects missing categories and rules", async () => {
    const missingCategory = createService({}, { exists: vi.fn().mockResolvedValue(false) });
    await expect(
      missingCategory.service.create("u1", { pattern: "coffee", categoryId: CATEGORY_ID }, "key")
    ).rejects.toBeInstanceOf(EntityNotFoundError);

    const missingRule = createService({ delete: vi.fn().mockResolvedValue(false) }, {});
    await expect(missingRule.service.delete("u1", RULE_ID, "key")).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
  });
});
