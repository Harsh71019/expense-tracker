import { describe, expect, it } from "vitest";

import {
  AssetFundingPageSchema,
  AssetFundingSchema,
  ListAssetFundingsQuerySchema
} from "./asset-funding.js";

const ids = {
  funding: "099fa04f-ef5a-4f9d-b4bc-0cc8d0580f2f",
  otherFunding: "2bcf2a5e-5d40-42ec-9ec1-af90d336f149",
  asset: "e469bfa9-380e-4c03-853a-1e478b4ac4aa",
  transaction: "f5fd5c6a-a8cf-428c-8ae8-b8e676ed8c2d"
};

const base = {
  id: ids.funding,
  userId: "user-1",
  assetId: ids.asset,
  transactionId: ids.transaction,
  amountMinor: 1,
  occurredAt: new Date("2026-08-22T00:00:00.000Z"),
  createdAt: new Date("2026-08-22T00:00:00.000Z")
};

describe("AssetFundingSchema", () => {
  it("accepts each valid append-only lifecycle shape", () => {
    expect(AssetFundingSchema.parse({ ...base, status: "posted" }).status).toBe("posted");
    expect(
      AssetFundingSchema.parse({ ...base, status: "reversed", reversedBy: ids.otherFunding }).status
    ).toBe("reversed");
    expect(
      AssetFundingSchema.parse({ ...base, status: "reversal", reversalOf: ids.otherFunding }).status
    ).toBe("reversal");
  });

  it("rejects invalid lifecycle shapes and non-integer amounts", () => {
    expect(() =>
      AssetFundingSchema.parse({ ...base, status: "posted", reversedBy: ids.otherFunding })
    ).toThrow();
    expect(() =>
      AssetFundingSchema.parse({ ...base, amountMinor: 1.5, status: "posted" })
    ).toThrow();
    expect(() =>
      AssetFundingSchema.parse({ ...base, status: "reversed", reversedBy: ids.funding })
    ).toThrow();
  });
});

describe("asset funding history contracts", () => {
  it("defaults the bounded funding-history page size to 50", () => {
    expect(ListAssetFundingsQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(() => ListAssetFundingsQuerySchema.parse({ limit: 201 })).toThrow();
  });

  it("accepts a cursor-paginated funding history page", () => {
    expect(
      AssetFundingPageSchema.parse({
        items: [{ ...base, status: "posted" }],
        pageInfo: { nextCursor: "next", hasMore: true, limit: 50 }
      }).pageInfo.nextCursor
    ).toBe("next");
  });
});
