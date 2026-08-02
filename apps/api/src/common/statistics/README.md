# Integer algorithm primitives

These modules are pure foundations for later finance features. They have no controller, service,
repository, ledger, or scheduled-job call sites in PR 03.

- Quantiles use an integer `quantileBps` in `[0, 10_000]` and PostgreSQL `percentile_disc`
  semantics. Medians are therefore lower/discrete medians for even samples; paise values are never
  interpolated.
- Median absolute deviation uses the same discrete median twice and throws if a signed deviation
  cannot be represented as a JavaScript safe integer.
- Fixed-point multiplication and ratio helpers use `bigint` intermediates, round exact halves away
  from zero, and reject narrowing overflow.
- Jaccard, Jaro, and Jaro-Winkler return integer basis-point scores. Jaro-Winkler applies its bonus
  only above the configured Jaro threshold and caps it at four prefix code points and 1,000 basis
  points of the remaining distance per prefix code point.
- Soft TF-IDF uses smoothed inverse-document-frequency weights, one-to-one soft token matches, and
  an integer cosine denominator. Corpus documents, tokens per document, and token length all have
  hard limits; exceeding a limit throws rather than silently truncating personal history.
- CUSUM implements only the integer-paise tabular accumulator. Warm-up, persistence, resets, and
  zero-MAD fallback are domain policy owned by the later change-detection PR.

NFKC normalization is applied inside string scorers for deterministic Unicode equivalence. Case,
transport-noise removal, and meaningful-token selection remain the responsibility of the versioned
transaction-text normalizer and its future domain caller.
