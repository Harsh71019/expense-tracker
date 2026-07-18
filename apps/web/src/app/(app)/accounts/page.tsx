import type { ReactNode } from "react";

import { AccountManager } from "@/features/accounts";
import { getAccounts } from "@/features/accounts/server/get-accounts";

export default async function AccountsPage(): Promise<ReactNode> {
  return <AccountManager initialAccounts={await getAccounts()} />;
}
