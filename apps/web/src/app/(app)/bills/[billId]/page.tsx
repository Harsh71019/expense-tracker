import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getAccounts } from "@/features/accounts/server/get-accounts";
import { BillDetail } from "@/features/bills";
import { getBillDetail } from "@/features/bills/server/get-bill-detail";

export default async function BillDetailPage({
  params
}: Readonly<{ params: Promise<{ billId: string }> }>): Promise<ReactNode> {
  const { billId } = await params;
  const [detail, accounts] = await Promise.all([getBillDetail(billId), getAccounts()]);
  if (detail === null) notFound();
  return <BillDetail initialDetail={detail} accounts={accounts} />;
}
