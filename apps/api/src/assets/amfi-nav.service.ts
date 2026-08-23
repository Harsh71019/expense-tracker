import { Injectable } from "@nestjs/common";
import {
  parsePositiveDecimalToMicroUnits,
  type FundSchemeOption,
  type FundSchemePlan,
  type MarketInstrumentItem
} from "@treasury-ops/shared";

import { DependencyUnavailableError } from "../common/errors/dependency-unavailable.error.js";

const AMFI_NAV_ALL_URL = "https://portal.amfiindia.com/spages/NAVAll.txt";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const NAV_LINE_FIELDS = 6;
const DATE_PARTS = 3;
const CATALOG_TTL_MS = 60 * 60_000; // 1 hour

export type AmfiNavQuote = Readonly<{
  schemeCode: string;
  priceMicroRupeesPerUnit: number;
  providerAsOf: Date;
}>;

/** Reads the official AMFI NAV feed once and keeps only the requested schemes. */
@Injectable()
export class AmfiNavService {
  private cachedCatalog: { items: MarketInstrumentItem[]; fetchedAt: number } | null = null;

  async getCatalog(): Promise<MarketInstrumentItem[]> {
    const now = Date.now();
    if (this.cachedCatalog !== null && now - this.cachedCatalog.fetchedAt < CATALOG_TTL_MS) {
      return this.cachedCatalog.items;
    }

    const response = await this.fetchNavFeed();
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) {
      throw new DependencyUnavailableError("AMFI NAV feed exceeded the supported size limit.");
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const items = parseAmfiCatalog(text);
    this.cachedCatalog = { items, fetchedAt: now };
    return items;
  }

  async fetchTrackedQuotes(schemeCodes: ReadonlySet<string>): Promise<Map<string, AmfiNavQuote>> {
    if (schemeCodes.size === 0) return new Map();

    const response = await this.fetchNavFeed();
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) {
      throw new DependencyUnavailableError("AMFI NAV feed exceeded the supported size limit.");
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return parseAmfiNavFeed(text, schemeCodes);
  }

  private async fetchNavFeed(): Promise<Response> {
    try {
      const response = await fetch(AMFI_NAV_ALL_URL, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { Accept: "text/plain" }
      });
      if (!response.ok) throw new Error(`AMFI returned HTTP ${response.status}.`);
      const contentLength = response.headers.get("content-length");
      if (contentLength !== null && isResponseTooLarge(contentLength)) {
        throw new Error("AMFI NAV feed exceeded the supported size limit.");
      }
      return response;
    } catch {
      throw new DependencyUnavailableError("AMFI NAV feed is temporarily unavailable.");
    }
  }
}

export function parseAmfiCatalog(text: string): MarketInstrumentItem[] {
  const items: MarketInstrumentItem[] = [];
  const seenCodes = new Set<string>();

  for (const line of text.split(/\r?\n/u)) {
    const fields = line.split(";");
    if (fields.length !== NAV_LINE_FIELDS) continue;
    const schemeCode = fields[0]?.trim();
    const isinGrowth = fields[1]?.trim();
    const isinDiv = fields[2]?.trim();
    const schemeName = fields[3]?.trim();

    if (
      schemeCode === undefined ||
      schemeName === undefined ||
      schemeCode.length === 0 ||
      schemeName.length === 0
    ) {
      continue;
    }
    if (seenCodes.has(schemeCode)) continue;
    seenCodes.add(schemeCode);

    const isin =
      isinGrowth && isinGrowth.length > 0 && isinGrowth !== "-"
        ? isinGrowth
        : isinDiv && isinDiv.length > 0 && isinDiv !== "-"
          ? isinDiv
          : undefined;

    items.push({
      instrumentType: "mutual_fund",
      provider: "amfi",
      providerInstrumentId: schemeCode,
      schemeCode,
      ...(isin !== undefined ? { isin } : {}),
      name: schemeName,
      ...(parseSchemePlan(schemeName) !== undefined
        ? { schemePlan: parseSchemePlan(schemeName) }
        : {}),
      ...(parseSchemeOption(schemeName) !== undefined
        ? { schemeOption: parseSchemeOption(schemeName) }
        : {}),
      quoteUnit: "fund_unit"
    });
  }

  return items;
}

function parseSchemePlan(name: string): FundSchemePlan | undefined {
  const upper = name.toUpperCase();
  if (upper.includes("DIRECT")) return "direct";
  if (upper.includes("REGULAR")) return "regular";
  return undefined;
}

function parseSchemeOption(name: string): FundSchemeOption | undefined {
  const upper = name.toUpperCase();
  if (upper.includes("GROWTH")) return "growth";
  if (
    upper.includes("IDCW") ||
    upper.includes("DIVIDEND") ||
    upper.includes("PAYOUT") ||
    upper.includes("REINVEST")
  )
    return "idcw";
  return undefined;
}

export function parseAmfiNavFeed(
  text: string,
  wantedSchemeCodes: ReadonlySet<string>
): Map<string, AmfiNavQuote> {
  const quotes = new Map<string, AmfiNavQuote>();
  for (const line of text.split(/\r?\n/u)) {
    const fields = line.split(";");
    if (fields.length !== NAV_LINE_FIELDS) continue;
    const schemeCode = fields[0]?.trim();
    const nav = fields[4]?.trim();
    const asOf = fields[5]?.trim();
    if (
      schemeCode === undefined ||
      nav === undefined ||
      asOf === undefined ||
      !wantedSchemeCodes.has(schemeCode)
    ) {
      continue;
    }
    try {
      quotes.set(schemeCode, {
        schemeCode,
        priceMicroRupeesPerUnit: parsePositiveDecimalToMicroUnits(nav),
        providerAsOf: parseAmfiDate(asOf)
      });
    } catch {
      // A malformed provider row is simply not a usable quote. The caller
      // leaves the preceding valuation in place rather than inventing one.
    }
  }
  return quotes;
}

function isResponseTooLarge(value: string): boolean {
  const parsed = Number(value);
  return !Number.isSafeInteger(parsed) || parsed > MAX_RESPONSE_BYTES;
}

function parseAmfiDate(value: string): Date {
  const [dayText, monthText, yearText] = value.split("-");
  if (dayText === undefined || monthText === undefined || yearText === undefined) {
    throw new RangeError("AMFI NAV date is malformed.");
  }
  const day = Number(dayText);
  const year = Number(yearText);
  const month = monthIndex(monthText);
  if (!Number.isInteger(day) || !Number.isInteger(year) || month === undefined) {
    throw new RangeError("AMFI NAV date is malformed.");
  }
  const parsed = new Date(Date.UTC(year, month, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month ||
    parsed.getUTCDate() !== day ||
    value.split("-").length !== DATE_PARTS
  ) {
    throw new RangeError("AMFI NAV date is invalid.");
  }
  return parsed;
}

function monthIndex(value: string): number | undefined {
  const months = new Map<string, number>([
    ["JAN", 0],
    ["FEB", 1],
    ["MAR", 2],
    ["APR", 3],
    ["MAY", 4],
    ["JUN", 5],
    ["JUL", 6],
    ["AUG", 7],
    ["SEP", 8],
    ["OCT", 9],
    ["NOV", 10],
    ["DEC", 11]
  ]);
  return months.get(value.toUpperCase());
}
