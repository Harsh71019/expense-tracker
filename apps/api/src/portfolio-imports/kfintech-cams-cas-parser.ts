import {
  parseMinor,
  parsePositiveDecimalToMicroUnits,
  type PortfolioImportRowAction,
  type PortfolioImportRowKind
} from "@treasury-ops/shared";

const REQUIRED_MARKERS = [
  "KFINTECH",
  "CAMS",
  "CONSOLIDATED ACCOUNT STATEMENT",
  "PORTFOLIO SUMMARY",
  "UNIT BALANCE"
] as const;
const FOLIO_SPLIT = /folio\s+no\s*:/iu;
const FOLIO_VALUE = /^\s*([0-9 /-]+)/u;
const ISIN_VALUE = /isin\s*:\s*([A-Z0-9]+)/iu;
const CLOSING_BALANCE = /closing\s+unit\s+balance\s*:\s*([0-9.]+)/iu;
const TRANSACTION_LINE =
  /^(\d{2}-[A-Za-z]{3}-\d{4})\s+(.+?)\s+([0-9,]+(?:\.\d{1,2})?)\s+([0-9.]+)\s+([0-9.]+)(?:\s+[0-9.]+)?\s*$/u;

export type ParsedCasRow = Readonly<{
  rowKind: PortfolioImportRowKind;
  displayName: string;
  isin?: string | undefined;
  folioReferenceMasked: string;
  transactionType?: string | undefined;
  occurredAt?: Date | undefined;
  quantityMicroUnits: number;
  grossAmountMinor?: number | undefined;
  navMicroRupeesPerUnit?: number | undefined;
  proposedAction: PortfolioImportRowAction;
}>;

/**
 * Parses only normalized position facts from a supported KFintech/CAMS text
 * layer. Caller-owned document bytes/text must be disposed after this method;
 * no identity or free-form boilerplate is returned.
 */
export class KfintechCamsCasParser {
  supports(text: string): boolean {
    const normalized = text.toUpperCase();
    return REQUIRED_MARKERS.every((marker) => normalized.includes(marker));
  }

  parse(text: string): ParsedCasRow[] {
    if (!this.supports(text)) throw new RangeError("Unsupported KFintech/CAMS CAS layout.");

    const rows: ParsedCasRow[] = [];
    const folios = text.split(FOLIO_SPLIT).slice(1);
    for (const folio of folios) {
      const parsedFolio = parseFolio(folio);
      if (parsedFolio === null) continue;
      rows.push(...parseTransactionRows(folio, parsedFolio));
      const holding = parseHoldingRow(folio, parsedFolio);
      if (holding !== null) rows.push(holding);
    }
    return rows;
  }
}

type FolioIdentity = Readonly<{
  displayName: string;
  folioReferenceMasked: string;
  isin?: string | undefined;
}>;

function parseFolio(block: string): FolioIdentity | null {
  const folio = FOLIO_VALUE.exec(block)?.[1]?.replaceAll(/[^0-9]/gu, "");
  if (folio === undefined || folio.length < 4) return null;
  const isinMatch = ISIN_VALUE.exec(block);
  const schemeLine = block
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.toUpperCase().includes("ISIN:"));
  if (schemeLine === undefined) return null;
  const displayName = schemeLine
    .replace(/\(advisor\s*:[^)]+\)/iu, "")
    .replace(/isin\s*:\s*[A-Z0-9]+/iu, "")
    .replace(/\s*-\s*$/u, "")
    .trim();
  if (displayName.length === 0) return null;
  return {
    displayName,
    folioReferenceMasked: maskFolio(folio),
    ...(isinMatch?.[1] === undefined ? {} : { isin: isinMatch[1].toUpperCase() })
  };
}

function parseTransactionRows(block: string, folio: FolioIdentity): ParsedCasRow[] {
  const rows: ParsedCasRow[] = [];
  for (const untrimmedLine of block.split(/\r?\n/u)) {
    const line = untrimmedLine.trim();
    const match = TRANSACTION_LINE.exec(line);
    if (match === null) continue;
    const [dateText, description, amountText, quantityText, navText] = match.slice(1);
    if (
      dateText === undefined ||
      description === undefined ||
      amountText === undefined ||
      quantityText === undefined ||
      navText === undefined ||
      isNonPositionCharge(description)
    ) {
      continue;
    }
    const transactionType = classifyTransaction(description);
    if (transactionType === null) continue;
    try {
      rows.push({
        rowKind: "transaction",
        ...folio,
        transactionType,
        occurredAt: parseCasDate(dateText),
        quantityMicroUnits: parsePositiveDecimalToMicroUnits(quantityText),
        grossAmountMinor: parseMinor(amountText),
        navMicroRupeesPerUnit: parsePositiveDecimalToMicroUnits(navText),
        proposedAction: "append_event"
      });
    } catch {
      // Invalid provider numeric/date fields are omitted and surface as a
      // row-count/reconciliation warning at the staging boundary.
    }
  }
  return rows;
}

function parseHoldingRow(block: string, folio: FolioIdentity): ParsedCasRow | null {
  const quantity = CLOSING_BALANCE.exec(block)?.[1];
  if (quantity === undefined) return null;
  try {
    return {
      rowKind: "holding",
      ...folio,
      quantityMicroUnits: parsePositiveDecimalToMicroUnits(quantity),
      proposedAction: "reconcile"
    };
  } catch {
    return null;
  }
}

function classifyTransaction(description: string): string | null {
  const normalized = description.toUpperCase();
  if (normalized.includes("SWITCH IN")) return "switch_in";
  if (normalized.includes("SWITCH OUT")) return "switch_out";
  if (normalized.includes("REDEMPTION")) return "redemption";
  if (normalized.includes("REINVEST")) return "reinvestment";
  if (normalized.includes("PURCHASE") || normalized.includes("SYSTEMATIC INVESTMENT")) {
    return "purchase";
  }
  return null;
}

function isNonPositionCharge(description: string): boolean {
  return description.toUpperCase().includes("STAMP DUTY");
}

function parseCasDate(value: string): Date {
  const [dayText, monthText, yearText] = value.split("-");
  const month = monthIndex(monthText);
  const day = Number(dayText);
  const year = Number(yearText);
  if (month === undefined || !Number.isInteger(day) || !Number.isInteger(year)) {
    throw new RangeError("CAS transaction date is malformed.");
  }
  const parsed = new Date(Date.UTC(year, month, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month ||
    parsed.getUTCDate() !== day
  ) {
    throw new RangeError("CAS transaction date is invalid.");
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

function maskFolio(folio: string): string {
  return `****${folio.slice(-4)}`;
}
