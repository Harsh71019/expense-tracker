import type { ReactNode } from "react";

import { getAccounts } from "@/features/accounts/server/get-accounts";
import { BillList } from "@/features/bills";
import { parseBillFilters, type BillSearchParams } from "@/features/bills/model/bill-filters";
import { getBillPage } from "@/features/bills/server/get-bill-page";

export default async function BillsPage({
  searchParams
}: Readonly<{ searchParams: Promise<BillSearchParams> }>): Promise<ReactNode> {
  const filters = parseBillFilters(await searchParams);
  const [initialPage, accounts] = await Promise.all([getBillPage(filters), getAccounts()]);
  return <BillList initialPage={initialPage} filters={filters} accounts={accounts} />;
}
