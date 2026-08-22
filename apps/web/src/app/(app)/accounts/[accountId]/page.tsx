import { AccountIdSchema } from "@treasury-ops/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PageShell } from "@/components/ui/page-shell";
import { AccountDetail } from "@/features/accounts/components/account-detail";
import {
  parseAccountInsightsRange,
  type AccountDetailSearchParams
} from "@/features/accounts/model/account-insights-range";
import { getAccount } from "@/features/accounts/server/get-account";
import { getAccountInsights } from "@/features/accounts/server/get-account-insights";
import { getAccounts } from "@/features/accounts/server/get-accounts";
import { getCategories } from "@/features/categories/server/get-categories";
import { getTxnPage } from "@/features/transactions/server/get-txn-page";

type AccountDetailRouteProps = Readonly<{
  params: Promise<{ accountId: string }>;
  searchParams: Promise<AccountDetailSearchParams>;
}>;

export async function generateMetadata({ params }: AccountDetailRouteProps): Promise<Metadata> {
  const { accountId } = await params;
  const parsedId = AccountIdSchema.safeParse(accountId);
  if (!parsedId.success) return { title: "Account not found" };
  const account = await getAccount(parsedId.data);
  return { title: account === null ? "Account not found" : `${account.name} account` };
}

export default async function AccountDetailRoute({
  params,
  searchParams
}: AccountDetailRouteProps): Promise<ReactNode> {
  const [{ accountId }, rawSearchParams] = await Promise.all([params, searchParams]);
  const parsedId = AccountIdSchema.safeParse(accountId);
  if (!parsedId.success) notFound();

  const range = parseAccountInsightsRange(rawSearchParams);
  const [account, insights, initialTransactions, activeAccounts, categories] = await Promise.all([
    getAccount(parsedId.data),
    getAccountInsights(parsedId.data, range),
    getTxnPage({ accountId: parsedId.data, limit: 20 }),
    getAccounts(),
    getCategories()
  ]);

  if (account === null) notFound();
  if (insights === null) throw new Error("Account insights are unavailable.");

  const initialAccounts = activeAccounts.some((item) => item.id === account.id)
    ? activeAccounts
    : [account, ...activeAccounts];

  return (
    <PageShell width="wide">
      <AccountDetail
        account={account}
        insights={insights}
        initialTransactions={initialTransactions}
        initialAccounts={initialAccounts}
        initialCategories={categories}
      />
    </PageShell>
  );
}
