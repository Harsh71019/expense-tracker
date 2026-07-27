export type MinorAmount = number;

const PAISA_PER_RUPEE = 100;
const PAISA_PER_LAKH = 1_00_000 * PAISA_PER_RUPEE;
const PAISA_PER_CRORE = 1_00_00_000 * PAISA_PER_RUPEE;
const MAX_SAFE_MINOR_AMOUNT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_MINOR_AMOUNT = -MAX_SAFE_MINOR_AMOUNT;
const MONEY_INPUT =
  /^(?:₹\s*)?((?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3}))(?:\.(\d{1,2}))?$/;

export function isMinorAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function formatMinor(amountMinor: MinorAmount, currency = "INR"): string {
  if (!isMinorAmount(amountMinor)) {
    throw new RangeError("Amount must be a non-negative integer in paise.");
  }

  if (currency !== "INR") {
    throw new RangeError("TreasuryOps currently supports INR only.");
  }

  const rupees = Math.floor(amountMinor / PAISA_PER_RUPEE);
  const paise = amountMinor % PAISA_PER_RUPEE;
  const formattedRupees = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0
  }).format(rupees);

  return `₹${formattedRupees}.${paise.toString().padStart(2, "0")}`;
}

export function formatMinorInput(amountMinor: MinorAmount): string {
  return formatMinor(amountMinor).slice(1).replaceAll(",", "");
}

function formatRatio(amountMinor: MinorAmount, divisorMinor: number): string {
  const scaledHundredths =
    (BigInt(amountMinor) * 100n + BigInt(Math.floor(divisorMinor / 2))) / BigInt(divisorMinor);
  const whole = scaledHundredths / 100n;
  const fraction = scaledHundredths % 100n;
  return `${whole}.${fraction.toString().padStart(2, "0")}`;
}

export function formatSignedCompactMinor(amountMinor: number): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError("Amount must be an integer in paise.");
  }

  const magnitudeMinor = Math.abs(amountMinor);
  const formatted =
    magnitudeMinor >= PAISA_PER_CRORE
      ? `${formatRatio(magnitudeMinor, PAISA_PER_CRORE)} Cr`
      : magnitudeMinor >= PAISA_PER_LAKH
        ? `${formatRatio(magnitudeMinor, PAISA_PER_LAKH)} L`
        : formatMinor(magnitudeMinor).slice(1);
  return `${amountMinor < 0 ? "−" : ""}₹${formatted}`;
}

export function parseMinor(input: string): MinorAmount {
  const match = MONEY_INPUT.exec(input.trim());
  if (match === null) {
    throw new RangeError(
      "Amount must be a valid non-negative INR value with at most two decimals."
    );
  }

  const wholePart = match[1];
  if (wholePart === undefined) {
    throw new RangeError("Amount is missing its whole-rupee value.");
  }

  const fractionalPart = match[2] ?? "";
  const paisePart = fractionalPart.padEnd(2, "0");
  const minor = BigInt(wholePart.replaceAll(",", "")) * BigInt(PAISA_PER_RUPEE) + BigInt(paisePart);
  if (minor > MAX_SAFE_MINOR_AMOUNT) {
    throw new RangeError("Amount exceeds the supported paise range.");
  }

  return Number(minor);
}

export function parseSafeIntegerMinor(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError("Money value exceeds the supported paise range.");
    }
    return value;
  }

  let parsed: bigint;
  if (typeof value === "bigint") {
    parsed = value;
  } else if (typeof value === "string" && /^-?\d+$/.test(value)) {
    parsed = BigInt(value);
  } else {
    throw new TypeError("Money value must be an integer number, bigint, or decimal string.");
  }

  if (parsed < MIN_SAFE_MINOR_AMOUNT || parsed > MAX_SAFE_MINOR_AMOUNT) {
    throw new RangeError("Money value exceeds the supported paise range.");
  }
  return Number(parsed);
}

export function sumMinorAmounts(values: Iterable<number>): number {
  let total = 0n;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError("Money value exceeds the supported paise range.");
    }
    total += BigInt(value);
  }
  return parseSafeIntegerMinor(total);
}
