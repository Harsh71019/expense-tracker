import type { HttpHandler } from "msw";

import { findAccount, type GoalContributionDto, type GoalDto } from "../data/store";
import { mockProblem } from "../data/problem";
import type { MockHttp, MockStore } from "./types";

function liveGoal(store: MockStore, goal: GoalDto): GoalDto {
  if (goal.fundingMode === "linked_account" && goal.linkedAccountId !== undefined) {
    const account = findAccount(store, goal.linkedAccountId);
    const progressMinor = account === undefined ? 0 : account.balanceMinor - goal.startedMinor;
    return {
      ...goal,
      progressMinor,
      status:
        goal.status === "active" && progressMinor >= goal.targetMinor ? "achieved" : goal.status
    };
  }
  if (goal.fundingMode === "manual_envelope") {
    const contributions = store.goalContributions.filter((c) => c.goalId === goal.id);
    const progressMinor = contributions.reduce(
      (total, c) => total + (c.type === "deposit" ? c.amountMinor : -c.amountMinor),
      0
    );
    return {
      ...goal,
      progressMinor,
      status:
        goal.status === "active" && progressMinor >= goal.targetMinor ? "achieved" : goal.status
    };
  }
  const progressMinor = store.transactions
    .filter(
      (transaction) =>
        transaction.status === "posted" &&
        goal.tag !== undefined &&
        transaction.tags.includes(goal.tag)
    )
    .reduce(
      (total, transaction) =>
        total +
        (transaction.type === "income" ? transaction.amountMinor : -transaction.amountMinor),
      0
    );
  return {
    ...goal,
    progressMinor,
    status: goal.status === "active" && progressMinor >= goal.targetMinor ? "achieved" : goal.status
  };
}

function findGoal(store: MockStore, goalId: string): GoalDto | undefined {
  return store.goals.find((goal) => goal.id === goalId);
}

export function goalHandlers(http: MockHttp, store: MockStore): HttpHandler[] {
  return [
    http.get("/v1/goals", ({ query, response }) => {
      const status = query.get("status") ?? "active";
      return response(200).json(
        store.goals
          .filter((goal) => goal.status === status)
          .sort((left, right) => left.priority - right.priority)
          .map((goal) => liveGoal(store, goal))
      );
    }),

    http.post("/v1/goals", async ({ request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      const replay = store.idempotency.goals.get(key);
      if (replay !== undefined) {
        return response(200).json(replay, { headers: { "Idempotency-Replayed": "true" } });
      }
      const body = await request.json();
      if (body === undefined) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "Request body is required.")
        );
      }
      const account =
        body.fundingMode === "linked_account"
          ? findAccount(store, body.linkedAccountId)
          : undefined;
      if (body.fundingMode === "linked_account" && account === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Account not found."));
      }
      const now = new Date().toISOString();
      const goal: GoalDto = {
        id: store.nextGoalId(),
        userId: store.profile.userId,
        name: body.name,
        targetMinor: body.targetMinor,
        ...(body.targetDate === undefined ? {} : { targetDate: body.targetDate }),
        fundingMode: body.fundingMode,
        ...(body.fundingMode === "linked_account"
          ? { linkedAccountId: body.linkedAccountId }
          : body.fundingMode === "tagged"
            ? { tag: body.tag }
            : {}),
        priority: store.goals.length,
        status: "active",
        startedMinor: account?.balanceMinor ?? 0,
        progressMinor: 0,
        createdAt: now,
        updatedAt: now
      };
      store.goals.push(goal);
      store.idempotency.goals.set(key, goal);
      return response(201).json(goal);
    }),

    http.patch("/v1/goals/reorder", async ({ request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      if (store.idempotency.goalReorder.has(key)) {
        return response(204).empty();
      }
      const body = await request.json();
      if (body === undefined) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "Request body is required.")
        );
      }
      body.goalIds.forEach((goalId, priority) => {
        const goal = findGoal(store, goalId);
        if (goal !== undefined) goal.priority = priority;
      });
      store.idempotency.goalReorder.add(key);
      return response(204).empty();
    }),

    http.get("/v1/goals/{goalId}", ({ params, response }) => {
      const goal = findGoal(store, params.goalId);
      if (goal === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Goal not found."));
      }
      return response(200).json(liveGoal(store, goal));
    }),

    http.patch("/v1/goals/{goalId}", async ({ params, request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      const replay = store.idempotency.goals.get(key);
      if (replay !== undefined) {
        return response(200).json(replay, { headers: { "Idempotency-Replayed": "true" } });
      }
      const goal = findGoal(store, params.goalId);
      if (goal === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Goal not found."));
      }
      const body = await request.json();
      if (body === undefined) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "Request body is required.")
        );
      }
      if (body.name !== undefined) goal.name = body.name;
      if (body.targetMinor !== undefined) goal.targetMinor = body.targetMinor;
      if (body.targetDate !== undefined) goal.targetDate = body.targetDate;
      goal.updatedAt = new Date().toISOString();
      const live = liveGoal(store, goal);
      store.idempotency.goals.set(key, live);
      return response(200).json(live);
    }),

    http.post("/v1/goals/{goalId}/abandon", ({ params, request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      if (store.idempotency.goalAbandon.has(key)) {
        return response(204).empty();
      }
      const goal = findGoal(store, params.goalId);
      if (goal === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Goal not found."));
      }
      goal.status = "abandoned";
      goal.updatedAt = new Date().toISOString();
      store.idempotency.goalAbandon.add(key);
      return response(204).empty();
    }),

    http.get("/v1/goals/{goalId}/plan", ({ params, response }) => {
      const stored = findGoal(store, params.goalId);
      if (stored === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Goal not found."));
      }
      const goal = liveGoal(store, stored);
      const remainingMinor = Math.max(0, goal.targetMinor - goal.progressMinor);
      if (goal.targetDate !== undefined && goal.targetDate !== null) {
        const months = Math.max(
          1,
          Math.ceil((new Date(goal.targetDate).getTime() - Date.now()) / (30 * 86_400_000))
        );
        return response(200).json({
          goalId: goal.id,
          mode: "target_date",
          requiredMonthlyMinor: Math.ceil(remainingMinor / months),
          projectedCompletionDate: goal.targetDate
        });
      }
      return response(200).json({
        goalId: goal.id,
        mode: "at_current_rate",
        requiredMonthlyMinor: null,
        projectedCompletionDate: null
      });
    }),

    http.get("/v1/goals/{goalId}/contributions", ({ params, response }) => {
      const goal = findGoal(store, params.goalId);
      if (goal === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Goal not found."));
      }
      const contributions = store.goalContributions
        .filter((c) => c.goalId === params.goalId)
        .sort(
          (a, b) => new Date(b.occurredAt ?? "").getTime() - new Date(a.occurredAt ?? "").getTime()
        );
      return response(200).json(contributions);
    }),

    http.post("/v1/goals/{goalId}/contributions", async ({ params, request, response }) => {
      const key = request.headers.get("Idempotency-Key") ?? "";
      const replay = store.idempotency.goals.get(key);
      if (replay !== undefined) {
        return response(200).json(replay, { headers: { "Idempotency-Replayed": "true" } });
      }
      const goal = findGoal(store, params.goalId);
      if (goal === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Goal not found."));
      }
      const body = await request.json();
      if (body === undefined) {
        return response(422).json(
          mockProblem(422, "common.validation_failed", "Request body is required.")
        );
      }
      const now = new Date().toISOString();
      const contribution: GoalContributionDto = {
        id: store.nextGoalContributionId(),
        userId: store.profile.userId,
        goalId: goal.id,
        type: body.type,
        amountMinor: body.amountMinor,
        ...(body.note === undefined ? {} : { note: body.note }),
        occurredAt: body.occurredAt ?? now,
        createdAt: now
      };
      store.goalContributions.push(contribution);
      const live = liveGoal(store, goal);
      store.idempotency.goals.set(key, live);
      return response(200).json(live);
    }),

    http.get("/v1/goals/feasibility", ({ response }) => {
      const activeGoals = store.goals.filter((g) => g.status === "active");
      const allocations = activeGoals.map((g, index) => ({
        goalId: g.id,
        goalName: g.name,
        priority: g.priority ?? index,
        targetDate: g.targetDate ?? null,
        targetMinor: g.targetMinor,
        progressMinor: g.progressMinor,
        remainingMinor: Math.max(0, g.targetMinor - g.progressMinor),
        requiredMonthlyMinor: 1_000_000,
        allocatedMonthlyMinor: 1_000_000,
        projectedRange: {
          optimisticDate: "2026-11-01T00:00:00.000Z",
          baselineDate: "2026-12-01T00:00:00.000Z",
          pessimisticDate: "2027-01-01T00:00:00.000Z"
        },
        status: "feasible" as const,
        isFullyFunded: true,
        shortfallMinor: 0,
        monthlyFundingGapMinor: 0,
        monthlyFundingSurplusMinor: 0,
        explainability: "Fully funded at 100% required pace."
      }));

      return response(200).json({
        asOf: new Date().toISOString(),
        forecastSnapshotId: null,
        forecastModel: "trailing_median",
        forecastComputedAt: null,
        isForecastStale: false,
        isForecastSufficient: true,
        safetyBufferVersion: 1,
        safetyBufferMode: "essential_months",
        safetyBufferTargetMinor: 15_000_000,
        liquidBalanceMinor: 20_000_000,
        liquidBufferGapMinor: 0,
        conservativeAvailableMonthlyMinor: 5_000_000,
        totalRequiredMonthlyMinor: 3_000_000,
        monthlySurplusMinor: 2_000_000,
        assumptions: {
          knownRecurringOutflowMinor: 2_000_000,
          creditCardBillsDueMinor: 1_000_000,
          monthlyEssentialOutflowMinor: 3_000_000,
          isBufferDeficitDeducted: false
        },
        scenarios: [
          {
            scenarioType: "priority_order",
            name: "Priority Order",
            description: "Allocates monthly cash flow strictly according to user priority rank.",
            totalAllocatedMonthlyMinor: 3_000_000,
            unallocatedSurplusMinor: 0,
            allocations
          },
          {
            scenarioType: "target_date_order",
            name: "Target Date Order",
            description: "Prioritizes goals with nearest deadlines first.",
            totalAllocatedMonthlyMinor: 3_000_000,
            unallocatedSurplusMinor: 0,
            allocations
          },
          {
            scenarioType: "proportional",
            name: "Proportional Allocation",
            description:
              "Distributes available monthly cash flow proportionally to remaining targets.",
            totalAllocatedMonthlyMinor: 3_000_000,
            unallocatedSurplusMinor: 0,
            allocations
          }
        ]
      });
    })
  ];
}
