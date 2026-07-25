import type { GoalPlan } from "@treasury-ops/shared";
import type { ReactNode } from "react";

import { getAccounts } from "@/features/accounts/server/get-accounts";
import { GoalManager } from "@/features/goals";
import { getGoalPlan, getGoals } from "@/features/goals/server/get-goals";

export default async function GoalsPage(): Promise<ReactNode> {
  const [active, achieved, accounts] = await Promise.all([
    getGoals("active"),
    getGoals("achieved"),
    getAccounts()
  ]);
  const plans = (
    await Promise.all(active.map(async (goal): Promise<GoalPlan | null> => getGoalPlan(goal.id)))
  ).filter((plan): plan is GoalPlan => plan !== null);

  return (
    <GoalManager
      initialActive={active}
      initialAchieved={achieved}
      initialPlans={plans}
      accounts={accounts}
    />
  );
}
