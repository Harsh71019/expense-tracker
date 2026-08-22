import type { Asset, CreateAsset, Valuation } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import { EntityNotFoundError } from "../../common/errors/entity-not-found.error.js";
import { InvalidValuationSignError } from "../../common/errors/invalid-valuation-sign.error.js";
import { createMockDrizzleDb, focusedTestDouble } from "../../test/mock-drizzle.js";
import { AssetMutationService } from "../asset-mutation.service.js";
import { AssetService } from "../asset.service.js";
import { ValuationRepository } from "../valuation.repository.js";

const ASSET_ID = "123e4567-e89b-42d3-a456-426614174000";
const VALUATION_ID = "223e4567-e89b-42d3-a456-426614174000";
const NOW = new Date("2026-07-01T00:00:00.000Z");
const INPUT: CreateAsset = {
  kind: "investment",
  name: "Index fund",
  openedAt: NOW,
  openingValueMinor: 100_000
};
const ASSET: Asset = {
  id: ASSET_ID,
  userId: "u1",
  kind: "investment",
  name: "Index fund",
  openedAt: NOW,
  isClosed: false,
  createdAt: NOW,
  updatedAt: NOW
};
const VALUATION: Valuation = {
  id: VALUATION_ID,
  assetId: ASSET_ID,
  userId: "u1",
  valueMinor: 100_000,
  valuedAt: NOW,
  source: "manual",
  createdAt: NOW
};

type Double = Readonly<Record<string, ReturnType<typeof vi.fn>>>;
type Overrides = Readonly<{
  db?: Double;
  assets?: Double;
  valuations?: Double;
  audit?: Double;
  receivableService?: Double;
  receivables?: Double;
}>;

function createService(overrides: Overrides = {}) {
  const tx = {};
  const collaborators = {
    db:
      overrides.db ??
      ({
        transaction: vi.fn(async (work: (value: object) => Promise<unknown>) => work(tx))
      } satisfies Record<string, unknown>),
    assets: overrides.assets ?? {},
    valuations: overrides.valuations ?? {},
    audit: overrides.audit ?? { record: vi.fn().mockResolvedValue(undefined) },
    receivableService: overrides.receivableService ?? {},
    receivables: overrides.receivables ?? { findByLegacyAssetId: vi.fn().mockResolvedValue(null) }
  };
  const service = new AssetService(
    focusedTestDouble(collaborators.db),
    focusedTestDouble(collaborators.assets),
    focusedTestDouble(collaborators.valuations),
    focusedTestDouble(collaborators.audit),
    focusedTestDouble(collaborators.receivableService),
    focusedTestDouble(collaborators.receivables)
  );
  return { service, tx, ...collaborators };
}

describe("AssetService", () => {
  it("creates an asset and its opening valuation through the transaction wrapper", async () => {
    const assets = { create: vi.fn().mockResolvedValue(ASSET) };
    const valuations = { create: vi.fn().mockResolvedValue(VALUATION) };
    const context = createService({ assets, valuations });

    await expect(context.service.create("u1", INPUT)).resolves.toBe(ASSET);
    expect(valuations.create).toHaveBeenCalledWith(
      "u1",
      ASSET_ID,
      { valueMinor: 100_000, valuedAt: NOW, source: "manual" },
      context.tx
    );
    expect(context.audit.record).toHaveBeenCalledWith("u1", "asset.create", ASSET_ID, context.tx, {
      valuationId: VALUATION_ID,
      valueMinor: 100_000
    });
  });

  it("lists assets, closes through a transaction, and rejects a missing close target", async () => {
    const success = createService({
      assets: {
        list: vi.fn().mockResolvedValue([ASSET]),
        close: vi.fn().mockResolvedValue(true)
      }
    });
    await expect(success.service.list("u1")).resolves.toEqual([ASSET]);
    await expect(success.service.close("u1", ASSET_ID)).resolves.toBeUndefined();

    const missing = createService({ assets: { close: vi.fn().mockResolvedValue(false) } });
    await expect(
      missing.service.closeInTx(
        "u1",
        ASSET_ID,
        // @ts-expect-error - focused transaction double.
        missing.tx
      )
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it("adds positive valuations and permits negative loan-liability valuations", async () => {
    const positive = createService({
      assets: { findOpenById: vi.fn().mockResolvedValue(ASSET) },
      valuations: { create: vi.fn().mockResolvedValue(VALUATION) }
    });
    await expect(
      positive.service.addValuation("u1", ASSET_ID, {
        valueMinor: 110_000,
        valuedAt: NOW,
        source: "manual"
      })
    ).resolves.toBe(VALUATION);

    const liabilityAsset = { ...ASSET, kind: "loan_liability" as const };
    const negativeValuation = { ...VALUATION, valueMinor: -10_000 };
    const liability = createService({
      assets: { findOpenById: vi.fn().mockResolvedValue(liabilityAsset) },
      valuations: { create: vi.fn().mockResolvedValue(negativeValuation) }
    });
    await expect(
      liability.service.addValuationInTx(
        "u1",
        ASSET_ID,
        { valueMinor: -10_000, valuedAt: NOW, source: "manual" },
        // @ts-expect-error - focused transaction double.
        liability.tx
      )
    ).resolves.toBe(negativeValuation);
  });

  it("rejects missing assets and invalid negative valuations", async () => {
    const missing = createService({
      assets: { findOpenById: vi.fn().mockResolvedValue(null) }
    });
    await expect(
      missing.service.addValuationInTx(
        "u1",
        ASSET_ID,
        { valueMinor: 1, valuedAt: NOW, source: "manual" },
        // @ts-expect-error - focused transaction double.
        missing.tx
      )
    ).rejects.toBeInstanceOf(EntityNotFoundError);

    const invalid = createService({
      assets: { findOpenById: vi.fn().mockResolvedValue(ASSET) }
    });
    await expect(
      invalid.service.addValuationInTx(
        "u1",
        ASSET_ID,
        { valueMinor: -1, valuedAt: NOW, source: "manual" },
        // @ts-expect-error - focused transaction double.
        invalid.tx
      )
    ).rejects.toBeInstanceOf(InvalidValuationSignError);
  });

  it("returns a non-paginated valuation page", async () => {
    const context = createService({
      valuations: { listByAsset: vi.fn().mockResolvedValue([VALUATION]) }
    });
    await expect(context.service.listValuations("u1", ASSET_ID)).resolves.toEqual({
      items: [VALUATION],
      pageInfo: { nextCursor: null, hasMore: false, limit: 1 }
    });
  });
});

describe("AssetMutationService", () => {
  it("executes create, close, and valuation callbacks through idempotency", async () => {
    const assets = {
      createInTx: vi.fn().mockResolvedValue(ASSET),
      closeInTx: vi.fn().mockResolvedValue(null),
      addValuationInTx: vi.fn().mockResolvedValue(VALUATION)
    };
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
    // @ts-expect-error - focused collaborators implement every exercised method.
    const service = new AssetMutationService(assets, idempotency);

    await service.create("u1", INPUT, "key-1");
    await service.close("u1", ASSET_ID, "key-2");
    await service.addValuation(
      "u1",
      ASSET_ID,
      { valueMinor: 100_000, valuedAt: NOW, source: "manual" },
      "key-3"
    );
    expect(assets.createInTx).toHaveBeenCalledWith("u1", INPUT, tx);
    expect(assets.closeInTx).toHaveBeenCalledWith("u1", ASSET_ID, tx);
    expect(assets.addValuationInTx).toHaveBeenCalledWith(
      "u1",
      ASSET_ID,
      { valueMinor: 100_000, valuedAt: NOW, source: "manual" },
      tx
    );
  });
});

describe("ValuationRepository", () => {
  it("creates and lists parsed valuations", async () => {
    const db = createMockDrizzleDb([VALUATION]);
    const repository = new ValuationRepository(db);

    await expect(
      repository.create(
        "u1",
        ASSET_ID,
        { valueMinor: 100_000, valuedAt: NOW, source: "manual" },
        // @ts-expect-error - fluent transaction double.
        db
      )
    ).resolves.toEqual(VALUATION);
    await expect(repository.listByAsset("u1", ASSET_ID)).resolves.toEqual([VALUATION]);
  });

  it("rejects a create without a returned row", async () => {
    const db = createMockDrizzleDb();
    const repository = new ValuationRepository(db);
    await expect(
      repository.create(
        "u1",
        ASSET_ID,
        { valueMinor: 1, valuedAt: NOW, source: "manual" },
        // @ts-expect-error - fluent transaction double.
        db
      )
    ).rejects.toThrow("Valuation insert did not return a row.");
  });

  it("returns an empty latest map without querying and keeps only the newest row per asset", async () => {
    const rows = [
      { assetId: ASSET_ID, valueMinor: 120_000, valuedAt: NOW },
      { assetId: ASSET_ID, valueMinor: 100_000, valuedAt: new Date("2026-01-01") },
      {
        assetId: "323e4567-e89b-42d3-a456-426614174000",
        valueMinor: 50_000,
        valuedAt: NOW
      }
    ];
    const db = createMockDrizzleDb(rows);
    const repository = new ValuationRepository(db);

    await expect(repository.findLatestForAssets("u1", [])).resolves.toEqual(new Map());
    await expect(repository.findLatestForAssets("u1", [ASSET_ID])).resolves.toEqual(
      new Map([
        [ASSET_ID, { valueMinor: 120_000, valuedAt: NOW }],
        ["323e4567-e89b-42d3-a456-426614174000", { valueMinor: 50_000, valuedAt: NOW }]
      ])
    );
  });
});
