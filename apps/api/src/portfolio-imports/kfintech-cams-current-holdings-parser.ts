import { calculateMarketValueMinor, parsePositiveDecimalToMicroUnits } from "@treasury-ops/shared";

import type { ParsedCasRow } from "./kfintech-cams-cas-parser.js";

const REQUIRED_MARKERS = [
  "KFINTECH",
  "CAMS",
  "CONSOLIDATED ACCOUNT STATEMENT",
  "PORTFOLIO SUMMARY",
  "UNIT BALANCE"
] as const;
const ISIN_VALUE = /isin\s*:\s*([A-Z0-9]+)/iu;
const FOLIO_VALUE = /folio\s+no\s*:\s*([0-9 /-]+)/giu;
const CLOSING_SUMMARY =
  /closing\s+unit\s+balance\s*:\s*([0-9,.]+).*?nav\s+on\s+(\d{2}-[A-Za-z]{3}-\d{4})\s*:\s*(?:INR\s*)?([0-9,.]+)/iu;

type SchemeIdentity = Readonly<{ displayName: string; isin: string }>;
type ClosingPosition = Readonly<{
  quantityMicroUnits: number;
  navMicroRupeesPerUnit: number;
  occurredAt: Date;
}>;

/**
 * Parses only the authoritative current position snapshot. Historical CAS
 * transactions are not staged because replaying them together with the
 * closing balance would double-count the position.
 */
export class KfintechCamsCurrentHoldingsParser {
  supports(text: string): boolean {
    const normalized = text.toUpperCase();
    return REQUIRED_MARKERS.every((marker) => normalized.includes(marker));
  }

  parse(text: string): ParsedCasRow[] {
    if (!this.supports(text)) throw new RangeError("Unsupported KFintech/CAMS CAS layout.");

    const identities = parseSchemeIdentities(text);
    const folios = parseFolioReferences(text);
    const positions = parseClosingPositions(text);
    if (
      identities.length === 0 ||
      identities.length !== folios.length ||
      identities.length !== positions.length
    ) {
      throw new RangeError("CAS scheme, folio, and closing-position counts do not match.");
    }

    const holdings = identities.map((identity, index) => {
      const folioReferenceMasked = folios[index];
      const position = positions[index];
      if (folioReferenceMasked === undefined || position === undefined) {
        throw new RangeError("CAS holding association is incomplete.");
      }
      return {
        rowKind: "holding" as const,
        ...identity,
        folioReferenceMasked,
        ...position,
        proposedAction: "reconcile" as const
      };
    });
    return aggregateHoldingsByIsin(holdings).map((holding) => {
      if (holding.navMicroRupeesPerUnit === undefined) {
        throw new RangeError("CAS holding is missing its NAV snapshot.");
      }
      return {
        ...holding,
        grossAmountMinor: calculateMarketValueMinor(
          holding.quantityMicroUnits,
          holding.navMicroRupeesPerUnit
        )
      };
    });
  }
}

function parseSchemeIdentities(text: string): SchemeIdentity[] {
  const lines = text.split(/\r?\n/u);
  const identities: SchemeIdentity[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line === undefined) continue;
    const isinMatch = ISIN_VALUE.exec(line);
    if (isinMatch?.[1] === undefined) continue;
    const inlineName = cleanSchemeName(line.slice(0, isinMatch.index));
    const previousLine = index === 0 ? undefined : lines[index - 1];
    const displayName =
      inlineName.length > 0 ? inlineName : cleanSchemeName(previousLine?.trim() ?? "");
    if (displayName.length === 0) {
      throw new RangeError("CAS scheme identity is missing a display name.");
    }
    identities.push({ displayName, isin: isinMatch[1].toUpperCase() });
  }
  return identities;
}

function cleanSchemeName(value: string): string {
  return value
    .replace(/\(advisor\s*:[^)]+\).*$/iu, "")
    .replace(/\s*-\s*$/u, "")
    .replace(/\s*\((?:non[ -]?demat|demat)\)\s*$/iu, "")
    .trim();
}

function parseFolioReferences(text: string): string[] {
  const references: string[] = [];
  for (const match of text.matchAll(FOLIO_VALUE)) {
    const digits = match[1]?.replaceAll(/[^0-9]/gu, "");
    if (digits === undefined || digits.length < 4) {
      throw new RangeError("CAS folio reference is malformed.");
    }
    references.push(`****${digits.slice(-4)}`);
  }
  return references;
}

function parseClosingPositions(text: string): ClosingPosition[] {
  const positions: ClosingPosition[] = [];
  for (const line of text.split(/\r?\n/u)) {
    const match = CLOSING_SUMMARY.exec(line);
    const quantity = match?.[1];
    const date = match?.[2];
    const nav = match?.[3];
    if (quantity === undefined || date === undefined || nav === undefined) continue;
    positions.push({
      quantityMicroUnits: parsePositiveDecimalToMicroUnits(quantity.replaceAll(",", "")),
      navMicroRupeesPerUnit: parsePositiveDecimalToMicroUnits(nav.replaceAll(",", "")),
      occurredAt: parseCasDate(date)
    });
  }
  return positions;
}

function aggregateHoldingsByIsin(rows: readonly ParsedCasRow[]): ParsedCasRow[] {
  const aggregated = new Map<string, ParsedCasRow>();
  for (const row of rows) {
    const key = row.isin ?? `${row.displayName}|${row.folioReferenceMasked}`;
    const current = aggregated.get(key);
    if (current === undefined) {
      aggregated.set(key, row);
      continue;
    }
    if (
      current.navMicroRupeesPerUnit !== row.navMicroRupeesPerUnit ||
      current.occurredAt?.getTime() !== row.occurredAt?.getTime()
    ) {
      throw new RangeError("CAS folios for the same ISIN have inconsistent NAV snapshots.");
    }
    aggregated.set(key, {
      ...current,
      folioReferenceMasked: combineFolioReferences(
        current.folioReferenceMasked,
        row.folioReferenceMasked
      ),
      quantityMicroUnits: safeAddMicroUnits(current.quantityMicroUnits, row.quantityMicroUnits)
    });
  }
  return [...aggregated.values()];
}

function combineFolioReferences(first: string, second: string): string {
  const combined = `${first}, ${second}`;
  return combined.length <= 100 ? combined : "Multiple folios";
}

function safeAddMicroUnits(first: number, second: number): number {
  const total = BigInt(first) + BigInt(second);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Aggregated CAS holding exceeds the supported unit range.");
  }
  return Number(total);
}

function parseCasDate(value: string): Date {
  const [dayText, monthText, yearText] = value.split("-");
  const month = monthIndex(monthText);
  const day = Number(dayText);
  const year = Number(yearText);
  if (month === undefined || !Number.isInteger(day) || !Number.isInteger(year)) {
    throw new RangeError("CAS snapshot date is malformed.");
  }
  const parsed = new Date(Date.UTC(year, month, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new RangeError("CAS snapshot date is invalid.");
  }
  return parsed;
}

function monthIndex(value: string | undefined): number | undefined {
  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC"
  ];
  const index = months.indexOf(value?.toUpperCase() ?? "");
  return index === -1 ? undefined : index;
}
