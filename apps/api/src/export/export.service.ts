import { Injectable } from "@nestjs/common";
import { formatMinor, type ExportCsvQuery, type Transaction } from "@treasury-ops/shared";

import { AccountRepository } from "../accounts/account.repository.js";
import { CategoryRepository } from "../categories/category.repository.js";
import { toISTCalendarDate } from "../common/time/ist.js";
import { TransactionRepository } from "../transactions/transaction.repository.js";
import { neutralizeFormulaInjection, toCsvDocument } from "./csv-format.js";

const PAGE_SIZE = 200;
const CSV_HEADER = [
  "Date",
  "Type",
  "Status",
  "Account",
  "Category",
  "Description",
  "Tags",
  "Amount (INR)"
];

@Injectable()
export class ExportService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly accounts: AccountRepository,
    private readonly categories: CategoryRepository
  ) {}

  /** "Your data back out, always" (BACKEND.md §7) — every posted transaction in range. */
  async generateCsv(userId: string, query: ExportCsvQuery): Promise<string> {
    const [transactions, accounts, categories] = await Promise.all([
      this.fetchPosted(userId, query),
      this.accounts.list(userId),
      this.categories.list(userId)
    ]);

    const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
    const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

    const rows = transactions.map((txn) => [
      // Date/type/status/amount are programmatically formatted, never
      // attacker-controlled — only genuinely free-text fields need explicit
      // neutralizeFormulaInjection (csv-format.ts's toCsvRow doesn't apply
      // it automatically; the caller decides which cells need it).
      toISTCalendarDate(txn.occurredAt),
      txn.type,
      txn.status,
      neutralizeFormulaInjection(accountNames.get(txn.accountId) ?? ""),
      neutralizeFormulaInjection(
        txn.categoryId === undefined ? "" : (categoryNames.get(txn.categoryId) ?? "")
      ),
      neutralizeFormulaInjection(txn.description),
      neutralizeFormulaInjection(txn.tags.join("; ")),
      formatSignedAmount(txn.amountMinor, txn.type)
    ]);

    return toCsvDocument([CSV_HEADER, ...rows]);
  }

  private async fetchPosted(userId: string, query: ExportCsvQuery): Promise<Transaction[]> {
    const items: Transaction[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.transactions.findMany(userId, {
        from: query.from,
        to: query.to,
        cursor,
        limit: PAGE_SIZE
      });
      items.push(...page.items);
      if (!page.pageInfo.hasMore || page.pageInfo.nextCursor === null) break;
      cursor = page.pageInfo.nextCursor;
    }
    return items.filter((txn) => txn.status === "posted");
  }
}

function formatSignedAmount(amountMinor: number, type: Transaction["type"]): string {
  const formatted = formatMinor(amountMinor);
  return type === "expense" ? `-${formatted}` : formatted;
}
