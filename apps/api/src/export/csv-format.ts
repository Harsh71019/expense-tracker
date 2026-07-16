const FORMULA_INJECTION_PREFIXES = ["=", "+", "-", "@"];

/**
 * AGENTS.md §8: "CSV export must keep formula-injection neutralization
 * (' prefix on =+-@ cells)." Callers apply this explicitly to whichever
 * cell values are genuinely user-controlled free text (description, tags,
 * account/category names) — not blanket, over every cell. A programmatically
 * formatted column (a date, an enum, a signed amount from formatMinor())
 * can never carry attacker-chosen content, and neutralizing it anyway would
 * just prefix a stray `'` on every negative amount for zero security
 * benefit — a real, everyday cost in a ledger export that's roughly half
 * expenses.
 */
export function neutralizeFormulaInjection(value: string): string {
  return FORMULA_INJECTION_PREFIXES.some((prefix) => value.startsWith(prefix))
    ? `'${value}`
    : value;
}

/** RFC 4180 field quoting — wraps in quotes and escapes embedded quotes if needed. */
export function csvQuote(value: string): string {
  if (!/[",\n\r]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}

export function toCsvRow(cells: readonly string[]): string {
  return cells.map((cell) => csvQuote(cell)).join(",");
}

export function toCsvDocument(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => toCsvRow(row)).join("\r\n") + "\r\n";
}
