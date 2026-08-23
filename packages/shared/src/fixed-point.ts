import { z } from "zod";

const MICRO_UNITS_PER_UNIT = 1_000_000n;
const MICRO_UNITS_PER_MILLI_UNIT = 1_000n;
const PAISE_PER_RUPEE = 100n;
const PURITY_BPS_DIVISOR = 10_000n;
const MARKET_VALUE_DIVISOR = (MICRO_UNITS_PER_UNIT * MICRO_UNITS_PER_UNIT) / PAISE_PER_RUPEE;

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
