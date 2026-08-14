import type { ReactNode } from "react";

import { PageShell } from "@/components/ui/page-shell";
import {
  parseTransactionFilters,
  TxnList,
  type TransactionSearchParams
} from "@/features/transactions";
import { getTxnPage } from "@/features/transactions/server/get-txn-page";
import { getTransactionInsights } from "@/features/transactions/server/get-transaction-insights";
import { getPendingTransactions } from "@/features/pending-transactions/server/get-pending-transactions";

export default async function TransactionsPage({
  searchParams
}: Readonly<{ searchParams: Promise<TransactionSearchParams> }>): Promise<ReactNode> {
  const filters = parseTransactionFilters(await searchParams);
  const [firstPage, insights, pendingTransactions] = await Promise.all([
    getTxnPage(filters),
    getTransactionInsights(),
    getPendingTransactions()
  ]);
  return (
    <PageShell width="wide">
      <TxnList
        filters={filters}
        initialPage={firstPage}
        initialInsights={insights}
        initialPendingTransactions={pendingTransactions}
      />
    </PageShell>
  );
}
