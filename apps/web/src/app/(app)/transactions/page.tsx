import type { ReactNode } from "react";

import {
  parseTransactionFilters,
  TxnList,
  type TransactionSearchParams
} from "@/features/transactions";
import { getTxnPage } from "@/features/transactions/server/get-txn-page";
import { getTransactionInsights } from "@/features/transactions/server/get-transaction-insights";

export default async function TransactionsPage({
  searchParams
}: Readonly<{ searchParams: Promise<TransactionSearchParams> }>): Promise<ReactNode> {
  const filters = parseTransactionFilters(await searchParams);
  const [firstPage, insights] = await Promise.all([getTxnPage(filters), getTransactionInsights()]);
  return <TxnList filters={filters} initialPage={firstPage} initialInsights={insights} />;
}
