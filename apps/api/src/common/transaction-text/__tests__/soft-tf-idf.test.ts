import { describe, expect, it } from "vitest";

import {
  SOFT_TF_IDF_MAX_CORPUS_DOCUMENTS,
  SOFT_TF_IDF_MAX_TOKEN_CODE_POINTS,
  SOFT_TF_IDF_MAX_TOKENS_PER_DOCUMENT,
  prepareSoftTfIdfCorpus,
  softTfIdfSimilarityBps
} from "../soft-tf-idf.js";

describe("bounded fixed-point Soft TF-IDF", () => {
  const corpus = [
    ["common", "rent"],
    ["common", "groceries"],
    ["common", "travel"],
    ["common", "rare"]
  ];

  it("returns exact, empty, disjoint, and soft token-match scores", () => {
    expect(softTfIdfSimilarityBps(["rent"], ["rent"], corpus)).toBe(10_000);
    expect(softTfIdfSimilarityBps([], [], corpus)).toBe(10_000);
    expect(softTfIdfSimilarityBps([], ["rent"], corpus)).toBe(0);
    expect(softTfIdfSimilarityBps(["rent"], ["salary"], corpus)).toBe(0);

    const softMatch = softTfIdfSimilarityBps(["merchant"], ["merhcant"], corpus, {
      tokenSimilarityThresholdBps: 8_000
    });
    expect(softMatch).toBeGreaterThan(8_000);
    expect(softMatch).toBeLessThan(10_000);
  });

  it("weights a rare personal-corpus token more heavily than a common token", () => {
    const query = ["common", "rare"];
    const commonOnly = softTfIdfSimilarityBps(query, ["common"], corpus);
    const rareOnly = softTfIdfSimilarityBps(query, ["rare"], corpus);
    expect(rareOnly).toBeGreaterThan(commonOnly);
  });

  it("reuses prepared private-corpus document frequencies", () => {
    const prepared = prepareSoftTfIdfCorpus(corpus);
    expect(softTfIdfSimilarityBps(["common", "rare"], ["rare"], prepared)).toBe(
      softTfIdfSimilarityBps(["common", "rare"], ["rare"], corpus)
    );
  });

  it("counts repeated terms while retaining an inclusive basis-point bound", () => {
    const score = softTfIdfSimilarityBps(["rent", "rent", "august"], ["rent", "august"], corpus);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(10_000);
  });

  it("normalizes compatibility-equivalent tokens", () => {
    expect(softTfIdfSimilarityBps(["ＣＡＦÉ"], ["CAFÉ"], corpus)).toBe(10_000);
  });

  it("enforces explicit corpus and per-document resource bounds", () => {
    const oversizedCorpus = Array.from({ length: SOFT_TF_IDF_MAX_CORPUS_DOCUMENTS + 1 }, () => []);
    const oversizedDocument = Array.from(
      { length: SOFT_TF_IDF_MAX_TOKENS_PER_DOCUMENT + 1 },
      (_, index) => `token-${index}`
    );
    expect(() => softTfIdfSimilarityBps(["a"], ["a"], oversizedCorpus)).toThrow(RangeError);
    expect(() => softTfIdfSimilarityBps(oversizedDocument, ["a"], [])).toThrow(RangeError);
    expect(() => softTfIdfSimilarityBps(["a"], ["a"], [oversizedDocument])).toThrow(RangeError);
    expect(() =>
      softTfIdfSimilarityBps(["x".repeat(SOFT_TF_IDF_MAX_TOKEN_CODE_POINTS + 1)], ["x"], [])
    ).toThrow(RangeError);
  });

  it("rejects token thresholds outside basis-point bounds", () => {
    expect(() =>
      softTfIdfSimilarityBps(["a"], ["a"], corpus, { tokenSimilarityThresholdBps: -1 })
    ).toThrow(RangeError);
    expect(() =>
      softTfIdfSimilarityBps(["a"], ["a"], corpus, { tokenSimilarityThresholdBps: 10_001 })
    ).toThrow(RangeError);
  });

  it("preserves symmetry and score bounds as corpus-scoped properties", () => {
    const documents = [
      [],
      ["rent"],
      ["monthly", "rent"],
      ["montly", "rent"],
      ["common", "rare"],
      ["किराना", "दुकान"]
    ];
    for (const left of documents) {
      for (const right of documents) {
        const score = softTfIdfSimilarityBps(left, right, corpus, {
          tokenSimilarityThresholdBps: 8_000
        });
        expect(score).toBe(
          softTfIdfSimilarityBps(right, left, corpus, {
            tokenSimilarityThresholdBps: 8_000
          })
        );
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(10_000);
      }
    }
  });
});
