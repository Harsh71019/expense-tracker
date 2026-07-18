import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { TxnDetail } from "@/features/transactions";
import { getTxn } from "@/features/transactions/server/get-txn";

export default async function TransactionDetailPage({
  params
}: {
  params: Promise<{ transactionId: string }>;
}): Promise<ReactNode> {
  const { transactionId } = await params;
  const transaction = await getTxn(transactionId);
  if (transaction === null) notFound();
  return <TxnDetail initialTransaction={transaction} />;
}
