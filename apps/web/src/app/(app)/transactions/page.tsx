import type { ReactNode } from "react";

import {
  parseTransactionFilters,
  TxnList,
  type TransactionSearchParams
} from "@/features/transactions";
import { getTxnPage } from "@/features/transactions/server/get-txn-page";

export default async function TransactionsPage({
  searchParams
}: Readonly<{ searchParams: Promise<TransactionSearchParams> }>): Promise<ReactNode> {
  const filters = parseTransactionFilters(await searchParams);
  const firstPage = await getTxnPage(filters);
  return <TxnList filters={filters} initialPage={firstPage} />;
}
