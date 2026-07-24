import type { ReactNode } from "react";

import { getAccounts } from "@/features/accounts/server/get-accounts";
import { DashboardHome, getRecentActivity } from "@/features/dashboard";
import { getSession } from "@/lib/api/session";

const RECENT_ACTIVITY_LIMIT = 5;

export default async function DashboardPage(): Promise<ReactNode> {
  const [session, accounts, recentActivity] = await Promise.all([
    getSession(),
    getAccounts(),
    getRecentActivity(RECENT_ACTIVITY_LIMIT)
  ]);
  const email = session?.user.email ?? "";

  return (
    <DashboardHome
      email={email}
      initialAccounts={accounts}
      initialRecentActivity={recentActivity}
    />
  );
}
