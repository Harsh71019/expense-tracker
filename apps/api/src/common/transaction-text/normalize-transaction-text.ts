import type {
  NormalizedTransactionText,
  TransactionTextDirectionHint,
  TransactionTextPaymentRail,
  TransactionTextReferenceKind,
  TransactionTextReferenceToken
} from "@treasury-ops/shared";

export const TRANSACTION_TEXT_NORMALIZER_VERSION = 1;

const RAIL_MARKERS: ReadonlyArray<
  Readonly<{ rail: Exclude<TransactionTextPaymentRail, "unknown">; tokens: ReadonlySet<string> }>
> = [
  { rail: "upi", tokens: new Set(["upi"]) },
  { rail: "neft", tokens: new Set(["neft"]) },
  { rail: "imps", tokens: new Set(["imps"]) },
  { rail: "nach", tokens: new Set(["nach"]) },
  { rail: "card", tokens: new Set(["card", "ecom", "pos"]) }
];

const TRANSPORT_NOISE = new Set([
  "card",
  "charge",
  "charges",
  "chg",
  "comm",
  "commission",
  "cr",
  "credit",
  "credited",
  "debit",
  "debited",
  "dr",
  "ecom",
  "fee",
  "from",
  "imps",
  "inv",
  "invoice",
  "mandate",
  "mastercard",
  "nach",
  "neft",
  "ord",
  "order",
  "p2m",
  "p2p",
  "paid",
  "payment",
  "pos",
  "ref",
  "reference",
  "refund",
  "rev",
  "reversal",
  "reversed",
  "rrn",
  "rvs",
  "to",
  "transaction",
  "transfer",
  "txn",
  "umrn",
  "upi",
  "utr",
  "via",
  "visa"
]);

const DEBIT_HINT_TOKENS = new Set(["debited", "dr"]);
const CREDIT_HINT_TOKENS = new Set(["cr", "credited"]);
const FEE_HINT_TOKENS = new Set(["charge", "charges", "chg", "comm", "commission", "fee"]);
const REFUND_HINT_TOKENS = new Set(["refund", "rev", "reversal", "reversed", "rvs"]);

const DELIMITED_VPA_PATTERN =
  /(?:^|[\s/|-])([a-z0-9][a-z0-9._]{0,63}@[a-z0-9][a-z0-9.]{1,63})(?=$|[\s/|-])/;
const HYPHENATED_LOCAL_PART_VPA_PATTERN =
  /(?:^|[\s/|])([a-z0-9][a-z0-9._-]{0,63}@[a-z0-9][a-z0-9.]{1,63})(?=$|[\s/|])/;

type RailAdapter = Readonly<{
  extractHandle: (canonicalText: string) => string | null;
  twelveDigitReferenceKind: TransactionTextReferenceKind;
}>;

type ReferenceCandidate = Readonly<{
  index: number;
  kind: TransactionTextReferenceKind;
  priority: number;
  value: string;
}>;

const GENERIC_ADAPTER: RailAdapter = {
  extractHandle: () => null,
  twelveDigitReferenceKind: "other"
};

const UPI_ADAPTER: RailAdapter = {
  extractHandle: extractUpiHandle,
  twelveDigitReferenceKind: "rrn"
};

const NEFT_ADAPTER: RailAdapter = {
  extractHandle: () => null,
  twelveDigitReferenceKind: "other"
};

const IMPS_ADAPTER: RailAdapter = {
  extractHandle: () => null,
  twelveDigitReferenceKind: "other"
};

const NACH_ADAPTER: RailAdapter = {
  extractHandle: () => null,
  twelveDigitReferenceKind: "other"
};

const CARD_ADAPTER: RailAdapter = {
  extractHandle: () => null,
  twelveDigitReferenceKind: "other"
};

function canonicalize(description: string): string {
  return description.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

function tokenize(value: string): string[] {
  return value.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
}

function containsAny(tokens: ReadonlySet<string>, candidates: ReadonlySet<string>): boolean {
  for (const candidate of candidates) {
    if (tokens.has(candidate)) return true;
  }
  return false;
}

function detectPaymentRail(tokens: ReadonlySet<string>): TransactionTextPaymentRail {
  let detectedRail: TransactionTextPaymentRail = "unknown";
  for (const marker of RAIL_MARKERS) {
    if (!containsAny(tokens, marker.tokens)) continue;
    if (detectedRail !== "unknown") return "unknown";
    detectedRail = marker.rail;
  }
  return detectedRail;
}

function detectDirection(tokens: ReadonlySet<string>): TransactionTextDirectionHint {
  const hasDebit =
    containsAny(tokens, DEBIT_HINT_TOKENS) || (tokens.has("debit") && !tokens.has("card"));
  const hasCredit =
    containsAny(tokens, CREDIT_HINT_TOKENS) || (tokens.has("credit") && !tokens.has("card"));
  if (hasDebit === hasCredit) return "unknown";
  return hasDebit ? "debit" : "credit";
}

function extractUpiHandle(canonicalText: string): string | null {
  const delimitedMatch = DELIMITED_VPA_PATTERN.exec(canonicalText);
  if (delimitedMatch?.[1] !== undefined) return delimitedMatch[1];

  return HYPHENATED_LOCAL_PART_VPA_PATTERN.exec(canonicalText)?.[1] ?? null;
}

function adapterFor(paymentRail: TransactionTextPaymentRail): RailAdapter {
  switch (paymentRail) {
    case "upi":
      return UPI_ADAPTER;
    case "neft":
      return NEFT_ADAPTER;
    case "imps":
      return IMPS_ADAPTER;
    case "nach":
      return NACH_ADAPTER;
    case "card":
      return CARD_ADAPTER;
    case "unknown":
      return GENERIC_ADAPTER;
  }
}

function collectMatches(
  canonicalText: string,
  pattern: RegExp,
  kind: TransactionTextReferenceKind,
  priority: number,
  candidates: ReferenceCandidate[]
): void {
  for (const match of canonicalText.matchAll(pattern)) {
    for (const value of match.slice(1)) {
      candidates.push({ index: match.index, kind, priority, value });
    }
  }
}

function keepBestReferenceCandidates(
  candidates: readonly ReferenceCandidate[]
): TransactionTextReferenceToken[] {
  const bestCandidates = new Map<string, ReferenceCandidate>();
  for (const candidate of candidates) {
    const duplicate = bestCandidates.get(candidate.value);
    if (duplicate === undefined || candidate.priority > duplicate.priority) {
      bestCandidates.set(candidate.value, candidate);
    }
  }
  return [...bestCandidates.values()]
    .sort((left, right) => left.index - right.index)
    .map(({ kind, value }) => ({ kind, value }));
}

function extractReferences(
  canonicalText: string,
  adapter: RailAdapter
): TransactionTextReferenceToken[] {
  const candidates: ReferenceCandidate[] = [];
  collectMatches(canonicalText, /\brrn[\s:/#-]*([a-z0-9-]{4,40})\b/g, "rrn", 4, candidates);
  collectMatches(canonicalText, /\butr[\s:/#-]*([a-z0-9-]{4,40})\b/g, "utr", 4, candidates);
  collectMatches(
    canonicalText,
    /\b(?:order|ord|invoice|inv)[\s:/#-]*([a-z0-9-]{1,40})\b/g,
    "order",
    4,
    candidates
  );
  collectMatches(
    canonicalText,
    /\b(?:reference|ref|transaction|txn)[\s:/#-]*([a-z0-9-]{4,40})\b/g,
    "other",
    2,
    candidates
  );
  collectMatches(
    canonicalText,
    /\b(?:mandate|umrn)[\s:/#-]*([a-z0-9-]{4,40})\b/g,
    "other",
    2,
    candidates
  );
  collectMatches(
    canonicalText,
    /\b(\d{12})\b/g,
    adapter.twelveDigitReferenceKind,
    adapter.twelveDigitReferenceKind === "rrn" ? 3 : 1,
    candidates
  );
  collectMatches(canonicalText, /\b(\d{10,})\b/g, "other", 1, candidates);
  return keepBestReferenceCandidates(candidates);
}

function removeReferences(
  text: string,
  references: readonly TransactionTextReferenceToken[]
): string {
  let withoutReferences = text;
  for (const reference of references) {
    withoutReferences = withoutReferences.split(reference.value).join(" ");
  }
  return withoutReferences;
}

function replaceHandleWithLocalPart(text: string, handle: string | null): string {
  if (handle === null) return text;
  const localPart = handle.slice(0, handle.indexOf("@"));
  return text.split(handle).join(` ${localPart} `);
}

function buildCounterpartyTokens(
  canonicalText: string,
  handle: string | null,
  references: readonly TransactionTextReferenceToken[]
): string[] {
  const withoutReferences = removeReferences(canonicalText, references);
  const withHandleClue = replaceHandleWithLocalPart(withoutReferences, handle);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const token of tokenize(withHandleClue)) {
    if (
      token.length <= 1 ||
      /^\p{N}{4,}$/u.test(token) ||
      TRANSPORT_NOISE.has(token) ||
      seen.has(token)
    ) {
      continue;
    }
    seen.add(token);
    result.push(token);
  }
  return result;
}

/**
 * Derives private matching features from a bank narration without changing or
 * persisting the source text. Explicit hints are deliberately conservative;
 * the parsed transaction type remains authoritative for money direction.
 */
export function normalizeTransactionText(description: string): NormalizedTransactionText {
  const canonicalText = canonicalize(description);
  const rawTokens = new Set(tokenize(canonicalText));
  const paymentRail = detectPaymentRail(rawTokens);
  const adapter = adapterFor(paymentRail);
  const counterpartyHandle = adapter.extractHandle(canonicalText);
  const referenceTokens = extractReferences(canonicalText, adapter);
  const counterpartyTokens = buildCounterpartyTokens(
    canonicalText,
    counterpartyHandle,
    referenceTokens
  );
  const counterpartyKey = counterpartyTokens.length === 0 ? null : counterpartyTokens.join(" ");
  const tokens = [...counterpartyTokens].sort();

  return {
    normalized: counterpartyKey ?? "",
    counterpartyKey,
    paymentRail,
    counterpartyHandle,
    directionHint: detectDirection(rawTokens),
    isFeeHint: containsAny(rawTokens, FEE_HINT_TOKENS),
    isRefundHint: containsAny(rawTokens, REFUND_HINT_TOKENS),
    tokens,
    referenceTokens,
    normalizerVersion: TRANSACTION_TEXT_NORMALIZER_VERSION
  };
}
