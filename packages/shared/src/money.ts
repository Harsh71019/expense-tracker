export type MinorAmount = number;

const PAISA_PER_RUPEE = 100;
const MAX_SAFE_MINOR_AMOUNT = BigInt(Number.MAX_SAFE_INTEGER);
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
    throw new RangeError("Vyaya currently supports INR only.");
  }

  const rupees = Math.floor(amountMinor / PAISA_PER_RUPEE);
  const paise = amountMinor % PAISA_PER_RUPEE;
  const formattedRupees = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0
  }).format(rupees);

  return `₹${formattedRupees}.${paise.toString().padStart(2, "0")}`;
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
