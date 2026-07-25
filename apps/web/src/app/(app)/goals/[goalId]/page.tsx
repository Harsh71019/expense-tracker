import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getAccounts } from "@/features/accounts/server/get-accounts";
import { GoalDetail } from "@/features/goals";
import { getGoal, getGoalPlan } from "@/features/goals/server/get-goals";
import { getTxnPage } from "@/features/transactions/server/get-txn-page";

export default async function GoalDetailPage({
  params
}: Readonly<{ params: Promise<{ goalId: string }> }>): Promise<ReactNode> {
  const { goalId } = await params;
  const goal = await getGoal(goalId);
  if (goal === null) notFound();

  const contributionFilters =
    goal.fundingMode === "linked_account"
      ? { accountId: goal.linkedAccountId, limit: 20 }
      : { tag: goal.tag, limit: 20 };
  const [plan, accounts, contributions] = await Promise.all([
    getGoalPlan(goal.id),
    getAccounts(),
    getTxnPage(contributionFilters)
  ]);

  return (
    <GoalDetail
      initialGoal={goal}
      initialPlan={plan}
      accounts={accounts}
      contributionFilters={contributionFilters}
      initialContributions={contributions}
    />
  );
}
