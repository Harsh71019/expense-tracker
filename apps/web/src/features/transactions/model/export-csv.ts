import type { Account, Category, Transaction } from "@treasury-ops/shared";
import { formatMinor } from "@treasury-ops/shared";

function sanitizeCsvCell(cell: string): string {
  // Neutralize formula injection: prefix with single-quote if starting with =, +, -, @, tab, or CR
  const needsQuotePrefix = /^[=+\-@\t\r]/.test(cell);
  const safeCell = needsQuotePrefix ? `'${cell}` : cell;
  // Escape double quotes and enclose in quotes if contains comma, quote, or newline
  if (
    safeCell.includes('"') ||
    safeCell.includes(",") ||
    safeCell.includes("\n") ||
    safeCell.includes("\r")
  ) {
    return `"${safeCell.replaceAll('"', '""')}"`;
  }
  return safeCell;
}

export function generateTransactionsCsv(
  transactions: readonly Transaction[],
  categoriesMap: ReadonlyMap<string, Category>,
  accountsMap: ReadonlyMap<string, Account>
): string {
  const headers = [
    "Transaction ID",
    "Date (ISO)",
    "Date (India)",
    "Description",
    "Type",
    "Amount (INR)",
    "Amount (Paise)",
    "Category",
    "Account",
    "Source",
    "Payment Rail",
    "Status",
    "Tags"
  ];

  const dateFormatter = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata"
  });

  const rows = transactions.map((t) => {
    const categoryName =
      t.categoryId !== undefined ? (categoriesMap.get(t.categoryId)?.name ?? "") : "";
    const accountName = accountsMap.get(t.accountId)?.name ?? "";
    const formattedAmount = `${t.type === "expense" ? "-" : ""}${formatMinor(t.amountMinor)}`;

    return [
      t.id,
      t.occurredAt.toISOString(),
      dateFormatter.format(t.occurredAt),
      t.description,
      t.type,
      formattedAmount,
      String(t.amountMinor),
      categoryName,
      accountName,
      t.source,
      t.paymentRail,
      t.status,
      t.tags.join(";")
    ]
      .map((val) => sanitizeCsvCell(val))
      .join(",");
  });

  return [headers.map((h) => sanitizeCsvCell(h)).join(","), ...rows].join("\r\n");
}

export function downloadCsvFile(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
