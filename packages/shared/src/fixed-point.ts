import { z } from "zod";

const MICRO_UNITS_PER_UNIT = 1_000_000n;
const MICRO_UNITS_PER_MILLI_UNIT = 1_000n;
const PAISE_PER_RUPEE = 100n;
const MICRO_RUPEES_PER_PAISE = MICRO_UNITS_PER_UNIT / PAISE_PER_RUPEE;
const PURITY_BPS_DIVISOR = 10_000n;
const MARKET_VALUE_DIVISOR = (MICRO_UNITS_PER_UNIT * MICRO_UNITS_PER_UNIT) / PAISE_PER_RUPEE;
const TROY_OUNCE_GRAMS_SCALE = 10_000_000n;
const TROY_OUNCE_GRAMS_SCALED = 311_034_768n;

export const QuantityMicroUnitsSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export const PriceMicroRupeesPerQuoteUnitSchema = z
  .number()
  .int()
  .min(1)
  .max(Number.MAX_SAFE_INTEGER);

export const PurityBpsSchema = z.number().int().min(1).max(10_000);

export const FixedPointDecimalSchema = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+)?$/);

export type QuantityMicroUnits = z.infer<typeof QuantityMicroUnitsSchema>;
export type PriceMicroRupeesPerQuoteUnit = z.infer<typeof PriceMicroRupeesPerQuoteUnitSchema>;
export type PurityBps = z.infer<typeof PurityBpsSchema>;

function toSafePositiveInteger(value: bigint, label: string): number {
  if (value < 1n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} exceeds the supported safe-integer range.`);
  }
  return Number(value);
}

function toSafeNonNegativeInteger(value: bigint, label: string): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} exceeds the supported safe-integer range.`);
  }
  return Number(value);
}

/**
 * Parses a non-zero decimal quantity or price into micro-units using only
 * decimal-string and bigint arithmetic. Values beyond six decimal places are
 * rounded half up so provider floats never enter financial calculations.
 */
export function parsePositiveDecimalToMicroUnits(input: string): number {
  const normalized = FixedPointDecimalSchema.parse(input);
  const decimalIndex = normalized.indexOf(".");
  const wholePart = decimalIndex === -1 ? normalized : normalized.slice(0, decimalIndex);
  const fractionalPart = decimalIndex === -1 ? "" : normalized.slice(decimalIndex + 1);
  const retainedFraction = fractionalPart.slice(0, 6).padEnd(6, "0");
  const roundingDigit = fractionalPart.charAt(6);
  const roundUp = roundingDigit !== "" && roundingDigit >= "5";
  const parsed =
    BigInt(wholePart) * MICRO_UNITS_PER_UNIT + BigInt(retainedFraction) + (roundUp ? 1n : 0n);

  return toSafePositiveInteger(parsed, "Fixed-point value");
}

/**
 * Converts an INR-per-troy-ounce decimal quote to INR-per-gram micro-rupees.
 * The troy-ounce divisor is represented exactly as 31.1034768 grams and the
 * final result is rounded half up once, so no binary float enters valuation.
 */
export function parseTroyOunceInrToMicroRupeesPerGram(input: string): number {
  const priceMicroRupeesPerTroyOunce = BigInt(parsePositiveDecimalToMicroUnits(input));
  const numerator = priceMicroRupeesPerTroyOunce * TROY_OUNCE_GRAMS_SCALE;
  const roundedMicroRupeesPerGram =
    (numerator + TROY_OUNCE_GRAMS_SCALED / 2n) / TROY_OUNCE_GRAMS_SCALED;

  return toSafePositiveInteger(roundedMicroRupeesPerGram, "INR price per gram in micro-rupees");
}

/** Converts a positive micro-rupee quote to paise, rounding half up once. */
export function microRupeesToMinorUnits(priceMicroRupees: PriceMicroRupeesPerQuoteUnit): number {
  const price = PriceMicroRupeesPerQuoteUnitSchema.parse(priceMicroRupees);
  return toSafePositiveInteger(
    (BigInt(price) + MICRO_RUPEES_PER_PAISE / 2n) / MICRO_RUPEES_PER_PAISE,
    "INR price in paise"
  );
}

/**
 * Calculates paise from a positive quantity and INR price, rounding only the
 * final paise result half up. Purity is applied in the same bigint expression
 * to avoid an intermediate rounding error for physical metals.
 */
export function calculateMarketValueMinor(
  quantityMicroUnits: QuantityMicroUnits,
  priceMicroRupeesPerQuoteUnit: PriceMicroRupeesPerQuoteUnit,
  purityBps: PurityBps = 10_000
): number {
  const quantity = QuantityMicroUnitsSchema.parse(quantityMicroUnits);
  const price = PriceMicroRupeesPerQuoteUnitSchema.parse(priceMicroRupeesPerQuoteUnit);
  const purity = PurityBpsSchema.parse(purityBps);
  const numerator = BigInt(quantity) * BigInt(price) * BigInt(purity);
  const divisor = MARKET_VALUE_DIVISOR * PURITY_BPS_DIVISOR;
  const roundedMinor = (numerator + divisor / 2n) / divisor;

  return toSafeNonNegativeInteger(roundedMinor, "Market value in paise");
}

/**
 * Converts a precise market quantity into the legacy thousandths-of-a-unit
 * cache used by physical gold and silver assets. The conversion is exact: a
 * fractional milli-unit must remain in the market position, not be rounded
 * into the legacy cache.
 */
export function microUnitsToMilliUnits(quantityMicroUnits: QuantityMicroUnits): number {
  const quantity = QuantityMicroUnitsSchema.parse(quantityMicroUnits);
  const microUnits = BigInt(quantity);
  if (microUnits % MICRO_UNITS_PER_MILLI_UNIT !== 0n) {
    throw new RangeError("Quantity cannot be represented exactly in milli-units.");
  }
  return toSafePositiveInteger(microUnits / MICRO_UNITS_PER_MILLI_UNIT, "Quantity in milli-units");
}

/** Formats micro-units (integer divided by 1,000,000) as a string with up to 6 decimal places. */
export function formatMicroUnits(microUnits: number): string {
  const isNegative = microUnits < 0;
  const abs = Math.abs(microUnits);
  const whole = Math.floor(abs / 1_000_000);
  const frac = (abs % 1_000_000).toString().padStart(6, "0").replace(/0+$/u, "");
  const formatted = frac.length > 0 ? `${whole}.${frac}` : `${whole}`;
  return isNegative ? `-${formatted}` : formatted;
}

/** Parses a decimal string (e.g. "123.456789") into micro-units (integer). */
export function parseMicroUnits(input: string): number {
  return parsePositiveDecimalToMicroUnits(input);
}

/** Formats price in micro-rupees per unit as INR decimal string. */
export function formatPricePerUnit(priceMicroRupees: number): string {
  const whole = Math.floor(priceMicroRupees / 1_000_000);
  const frac = (priceMicroRupees % 1_000_000).toString().padStart(6, "0").slice(0, 4);
  return `${whole}.${frac}`;
}

/** Parses price in rupees decimal string into micro-rupees. */
export function parsePricePerUnit(input: string): number {
  return parsePositiveDecimalToMicroUnits(input);
}
