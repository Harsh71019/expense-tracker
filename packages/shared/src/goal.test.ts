import { describe, expect, it } from "vitest";

import {
  CreateGoalContributionSchema,
  CreateGoalSchema,
  ReorderGoalsSchema,
  UpdateGoalSchema
} from "./goal.js";

const ACCOUNT_ID = "3fa85f64-5717-4562-b3fc-2c963f66beef";

describe("CreateGoalSchema", () => {
  it("accepts a linked-account goal with no tag", () => {
    const parsed = CreateGoalSchema.parse({
      name: "Emergency Fund",
      targetMinor: 500_000_00,
      fundingMode: "linked_account",
      linkedAccountId: ACCOUNT_ID
    });

    expect(parsed).toMatchObject({
      fundingMode: "linked_account",
      linkedAccountId: ACCOUNT_ID
    });
  });

  it("accepts a tagged goal with no linked account", () => {
    const parsed = CreateGoalSchema.parse({
      name: "New Laptop",
      targetMinor: 150_000_00,
      fundingMode: "tagged",
      tag: "goal:laptop"
    });

    expect(parsed).toMatchObject({ fundingMode: "tagged", tag: "goal:laptop" });
  });

  it("accepts a manual_envelope goal with no account or tag", () => {
    const parsed = CreateGoalSchema.parse({
      name: "Cash Vacation Jar",
      targetMinor: 50_000_00,
      fundingMode: "manual_envelope"
    });

    expect(parsed).toMatchObject({
      name: "Cash Vacation Jar",
      targetMinor: 50_000_00,
      fundingMode: "manual_envelope"
    });
  });

  it.each([
    {
      name: "requires a linked account for linked-account mode",
      input: {
        name: "Emergency Fund",
        targetMinor: 500_000_00,
        fundingMode: "linked_account"
      }
    },
    {
      name: "forbids a tag for linked-account mode",
      input: {
        name: "Emergency Fund",
        targetMinor: 500_000_00,
        fundingMode: "linked_account",
        linkedAccountId: ACCOUNT_ID,
        tag: "goal:emergency"
      }
    },
    {
      name: "requires a tag for tagged mode",
      input: {
        name: "New Laptop",
        targetMinor: 150_000_00,
        fundingMode: "tagged"
      }
    },
    {
      name: "forbids a linked account for tagged mode",
      input: {
        name: "New Laptop",
        targetMinor: 150_000_00,
        fundingMode: "tagged",
        tag: "goal:laptop",
        linkedAccountId: ACCOUNT_ID
      }
    },
    {
      name: "forbids a linked account for manual_envelope mode",
      input: {
        name: "Cash Fund",
        targetMinor: 10_000_00,
        fundingMode: "manual_envelope",
        linkedAccountId: ACCOUNT_ID
      }
    },
    {
      name: "forbids a tag for manual_envelope mode",
      input: {
        name: "Cash Fund",
        targetMinor: 10_000_00,
        fundingMode: "manual_envelope",
        tag: "goal:cash"
      }
    }
  ])("$name", ({ input }) => {
    expect(CreateGoalSchema.safeParse(input).success).toBe(false);
  });
});

describe("CreateGoalContributionSchema", () => {
  it("validates a deposit contribution", () => {
    const parsed = CreateGoalContributionSchema.parse({
      type: "deposit",
      amountMinor: 5_000_00,
      note: "Weekly savings from cash"
    });
    expect(parsed.type).toBe("deposit");
    expect(parsed.amountMinor).toBe(5_000_00);
    expect(parsed.note).toBe("Weekly savings from cash");
  });

  it("validates a withdrawal contribution", () => {
    const parsed = CreateGoalContributionSchema.parse({
      type: "withdrawal",
      amountMinor: 2_000_00
    });
    expect(parsed.type).toBe("withdrawal");
    expect(parsed.amountMinor).toBe(2_000_00);
  });

  it("rejects zero or negative amount", () => {
    expect(
      CreateGoalContributionSchema.safeParse({
        type: "deposit",
        amountMinor: 0
      }).success
    ).toBe(false);
    expect(
      CreateGoalContributionSchema.safeParse({
        type: "deposit",
        amountMinor: -500
      }).success
    ).toBe(false);
  });
});

describe("UpdateGoalSchema", () => {
  it("allows clearing an optional target date", () => {
    expect(UpdateGoalSchema.parse({ targetDate: null })).toEqual({ targetDate: null });
  });

  it("rejects an empty patch", () => {
    expect(UpdateGoalSchema.safeParse({}).success).toBe(false);
  });

  it("does not accept funding-binding changes", () => {
    expect(UpdateGoalSchema.safeParse({ tag: "goal:other", name: "Renamed" }).success).toBe(false);
  });
});

describe("ReorderGoalsSchema", () => {
  it("rejects duplicate goal ids", () => {
    expect(ReorderGoalsSchema.safeParse({ goalIds: [ACCOUNT_ID, ACCOUNT_ID] }).success).toBe(false);
  });
});
