import { describe, expect, it, vi } from "vitest";

import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { AccountMutationService } from "../account-mutation.service.js";
import { AccountService } from "../account.service.js";

const ACCOUNT_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("Account service edge coverage", () => {
  it("archives an account and rejects a missing account", async () => {
    const successRepo = { archive: vi.fn().mockResolvedValue(true) };
    await expect(
      new AccountService(
        focusedTestDouble({}),
        focusedTestDouble(successRepo),
        focusedTestDouble({})
      ).archive("u1", ACCOUNT_ID)
    ).resolves.toBeUndefined();

    const missingRepo = { archive: vi.fn().mockResolvedValue(false) };
    await expect(
      new AccountService(
        focusedTestDouble({}),
        focusedTestDouble(missingRepo),
        focusedTestDouble({})
      ).archive("u1", ACCOUNT_ID)
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it("rejects a missing archive target inside the mutation callback", async () => {
    const accounts = { archive: vi.fn().mockResolvedValue(false) };
    const idempotency = {
      execute: vi.fn(
        async (
          _userId: string,
          _operation: string,
          _key: string,
          _intent: unknown,
          _schema: unknown,
          work: (value: object) => Promise<unknown>
        ) => ({ result: await work({}), replayed: false })
      )
    };
    const service = new AccountMutationService(
      focusedTestDouble(accounts),
      focusedTestDouble(idempotency)
    );
    await expect(service.archive("u1", ACCOUNT_ID, "key")).rejects.toBeInstanceOf(
      EntityNotFoundError
    );
  });
});
