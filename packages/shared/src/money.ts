export type MinorAmount = number;

export function isMinorAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function formatMinor(amountMinor: MinorAmount, currency = "INR"): string {
  if (!isMinorAmount(amountMinor)) {
    throw new RangeError("Amount must be a non-negative integer in paise.");
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amountMinor / 100);
}
