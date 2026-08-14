import type { ReactNode } from "react";

import {
  parseTransactionFilters,
  TxnList,
  type TransactionSearchParams
} from "@/features/transactions";
import { getTxnPage } from "@/features/transactions/server/get-txn-page";
import { getTransactionInsights } from "@/features/transactions/server/get-transaction-insights";
import { PendingTransactionsPanel } from "@/features/pending-transactions";
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
    <div className="space-y-8">
      <PendingTransactionsPanel initialPendingTransactions={pendingTransactions} />
      <TxnList filters={filters} initialPage={firstPage} initialInsights={insights} />
    </div>
  );
}
