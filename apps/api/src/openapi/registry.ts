/**
 * @file registry.ts
 * @description OpenAPI Specification Registry.
 *
 * This file serves as the single source of truth for the API specification.
 * It uses `@asteasolutions/zod-to-openapi` to declare endpoints and map request/response
 * structures to Zod schemas imported from `@treasury-ops/shared`.
 *
 * DESIGN INVARIANTS:
 * 1. Schema Derivation: Never duplicate schema structures. All schemas used here
 *    MUST be imported directly from `@treasury-ops/shared`.
 * 2. Shared Registry Singleton: This `registry` instance is shared between the
 *    runtime endpoint (`OpenApiController`) and the static file generator script
 *    (`generate-openapi.ts`). This ensures the live docs and the web client generated
 *    types can never drift.
 * 3. Component Registration: Schemes like `cookieAuth` must be registered using
 *    `registry.registerComponent` so that the OpenAPI document generator properly
 *    includes them under components.
 */

import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  AccountIdSchema,
  AccountSchema,
  AcknowledgeExtraTransactionSchema,
  ApiKeySchema,
  BillDetailSchema,
  BillPageSchema,
  BillPaymentResultSchema,
  BillStatementRowIdSchema,
  BillStatementRowPageSchema,
  BillStatementRowSchema,
  BillStatementUploadSchema,
  CashflowQuerySchema,
  CashflowResponseSchema,
  CategoryIdSchema,
  CategorySchema,
  CategoryRuleIdSchema,
  CategoryRuleSchema,
  CreateAccountSchema,
  CreateApiKeyResponseSchema,
  CreateApiKeySchema,
  CreateCategorySchema,
  CreateCategoryRuleSchema,
  CreateTransactionSchema,
  CreditCardBillIdSchema,
  CreditCardBillSchema,
  CreditCardConfigInputSchema,
  DashboardInvestmentsSchema,
  DashboardStatsQuerySchema,
  DashboardStatsSchema,
  DashboardSummarySchema,
  ExportCsvQuerySchema,
  ListTransactionsQuerySchema,
  ProblemDetailsSchema,
  RecentActivityItemSchema,
  RecentActivityQuerySchema,
  RecurringForecastQuerySchema,
  RecurringForecastSchema,
  SpendMixQuerySchema,
  SpendMixSchema,
  TopSpendingItemSchema,
  TopSpendingQuerySchema,
  TransactionIdSchema,
  TransactionPageSchema,
  TransactionSchema,
  UpdateCategoryGroupSchema,
  UpdateTransactionSchema,
  CreateTransferSchema,
  TransferSchema,
  TransferReversalSchema,
  TransferGroupIdSchema,
  CreateAssetSchema,
  AssetSchema,
  AssetIdSchema,
  CreateValuationSchema,
  ValuationSchema,
  ValuationPageSchema,
  NetWorthSchema,
  ImportBatchSchema,
  AccountImportMappingSchema,
  ImportBatchIdSchema,
  PreviewStagedRowsQuerySchema,
  StagedRowIdSchema,
  StagedRowPageSchema,
  StagedRowSchema,
  UpdateStagedRowSchema,
  UserProfileSchema,
  UserProfileUpdateSchema,
  MonthSchema,
  MonthlyRollupSchema,
  CreateRecurringRuleSchema,
  CreateGoalSchema,
  GoalIdSchema,
  GoalPlanSchema,
  GoalSchema,
  ListGoalsQuerySchema,
  ListBillsQuerySchema,
  ListBillStatementRowsQuerySchema,
  ReorderGoalsSchema,
  RecurringRuleIdSchema,
  RecurringRuleSchema,
  PayCreditCardBillSchema,
  UpdateApiKeySchema,
  UpdateBillStatementRowSchema,
  UpdateRecurringRuleSchema,
  UpdateGoalSchema
} from "@treasury-ops/shared";
import { z } from "zod";

const registry = new OpenAPIRegistry();

const Account = AccountSchema.meta({ id: "Account" });
const Category = CategorySchema.meta({ id: "Category" });
const CategoryRule = CategoryRuleSchema.meta({ id: "CategoryRule" });
const Transaction = TransactionSchema.meta({ id: "Transaction" });
const TransactionPage = TransactionPageSchema.meta({ id: "TransactionPage" });
const ProblemDetails = ProblemDetailsSchema.meta({ id: "ProblemDetails" });
const Transfer = TransferSchema.meta({ id: "Transfer" });
const TransferReversal = TransferReversalSchema.meta({ id: "TransferReversal" });
const Asset = AssetSchema.meta({ id: "Asset" });
const Valuation = ValuationSchema.meta({ id: "Valuation" });
const ValuationPage = ValuationPageSchema.meta({ id: "ValuationPage" });
const NetWorth = NetWorthSchema.meta({ id: "NetWorth" });
const ImportBatch = ImportBatchSchema.meta({ id: "ImportBatch" });
const AccountImportMapping = AccountImportMappingSchema.meta({ id: "AccountImportMapping" });
const StagedRow = StagedRowSchema.meta({ id: "StagedRow" });
const StagedRowPage = StagedRowPageSchema.meta({ id: "StagedRowPage" });
const UserProfile = UserProfileSchema.meta({ id: "UserProfile" });
const MonthlyRollup = MonthlyRollupSchema.meta({ id: "MonthlyRollup" });
const RecurringRule = RecurringRuleSchema.meta({ id: "RecurringRule" });
const Goal = GoalSchema.meta({ id: "Goal" });
const GoalPlan = GoalPlanSchema.meta({ id: "GoalPlan" });
const DashboardSummary = DashboardSummarySchema.meta({ id: "DashboardSummary" });
const RecentActivityItem = RecentActivityItemSchema.meta({ id: "RecentActivityItem" });
const DashboardStats = DashboardStatsSchema.meta({ id: "DashboardStats" });
const CashflowResponse = CashflowResponseSchema.meta({ id: "CashflowResponse" });
const TopSpendingItem = TopSpendingItemSchema.meta({ id: "TopSpendingItem" });
const SpendMix = SpendMixSchema.meta({ id: "SpendMix" });
const DashboardInvestments = DashboardInvestmentsSchema.meta({ id: "DashboardInvestments" });
const RecurringForecast = RecurringForecastSchema.meta({ id: "RecurringForecast" });
const CreditCardBill = CreditCardBillSchema.meta({ id: "CreditCardBill" });
const BillPage = BillPageSchema.meta({ id: "BillPage" });
const BillDetail = BillDetailSchema.meta({ id: "BillDetail" });
const BillStatementUpload = BillStatementUploadSchema.meta({ id: "BillStatementUpload" });
const BillStatementRow = BillStatementRowSchema.meta({ id: "BillStatementRow" });
const BillStatementRowPage = BillStatementRowPageSchema.meta({ id: "BillStatementRowPage" });
const BillPaymentResult = BillPaymentResultSchema.meta({ id: "BillPaymentResult" });

const accountId = z.object({ accountId: AccountIdSchema });
const categoryId = z.object({ categoryId: CategoryIdSchema });
const categoryRuleId = z.object({ ruleId: CategoryRuleIdSchema });
const transactionId = z.object({ transactionId: TransactionIdSchema });
const assetId = z.object({ assetId: AssetIdSchema });
const transferGroupId = z.object({ transferGroupId: TransferGroupIdSchema });
const importBatchId = z.object({ importBatchId: ImportBatchIdSchema });
const importBatchAndRowId = z.object({
  importBatchId: ImportBatchIdSchema,
  stagedRowId: StagedRowIdSchema
});
const month = z.object({ month: MonthSchema });
const recurringRuleId = z.object({ ruleId: RecurringRuleIdSchema });
const goalId = z.object({ goalId: GoalIdSchema });
const billId = z.object({ billId: CreditCardBillIdSchema });
const billAndRowId = z.object({
  billId: CreditCardBillIdSchema,
  rowId: BillStatementRowIdSchema
});
const json = (schema: z.ZodType): { content: { "application/json": { schema: z.ZodType } } } => ({
  content: { "application/json": { schema } }
});
const problemResponses = {
  401: { description: "Unauthenticated", ...json(ProblemDetails) },
  422: { description: "Validation failed", ...json(ProblemDetails) },
  500: { description: "Internal error", ...json(ProblemDetails) }
};
const secured = [{ cookieAuth: [] }];
const securedByKeyOrCookie = [{ cookieAuth: [] }, { bearerAuth: [] }];
const idempotencyKeyHeaders = z.object({ "Idempotency-Key": z.string().uuid() });
const replayedHeaders = z.object({ "Idempotency-Replayed": z.literal("true") });
const optionalReplayHeaders = z.object({
  "Idempotency-Replayed": z.literal("true").optional()
});

registry.registerPath({
  method: "get",
  path: "/v1/accounts",
  security: securedByKeyOrCookie,
  responses: { 200: { description: "Accounts", ...json(z.array(Account)) }, ...problemResponses }
});
registry.registerPath({
  method: "post",
  path: "/v1/accounts",
  security: secured,
  request: { body: json(CreateAccountSchema), headers: idempotencyKeyHeaders },
  responses: {
    200: {
      description: "Idempotent replay of the created account",
      headers: replayedHeaders,
      ...json(Account)
    },
    201: { description: "Created account", ...json(Account) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/imports",
  security: secured,
  responses: {
    200: { description: "Import batches", ...json(z.array(ImportBatch)) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/imports/accounts/{accountId}/mapping",
  security: secured,
  request: { params: accountId },
  responses: {
    200: { description: "Saved import mapping", ...json(AccountImportMapping) },
    404: { description: "Account not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/imports/{importBatchId}/preview",
  security: secured,
  request: { params: importBatchId, query: PreviewStagedRowsQuerySchema },
  responses: {
    200: { description: "Staged row page", ...json(StagedRowPage) },
    404: { description: "Not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "patch",
  path: "/v1/imports/{importBatchId}/rows/{stagedRowId}",
  security: secured,
  request: { params: importBatchAndRowId, body: json(UpdateStagedRowSchema) },
  responses: {
    200: { description: "Updated row", ...json(StagedRow) },
    404: { description: "Not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/imports/{importBatchId}/commit",
  security: secured,
  request: { params: importBatchId },
  responses: {
    200: { description: "Committed batch", ...json(ImportBatch) },
    404: { description: "Not found", ...json(ProblemDetails) },
    409: { description: "Import batch cannot be committed", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/imports/{importBatchId}/revert",
  security: secured,
  request: { params: importBatchId },
  responses: {
    200: { description: "Reverted batch", ...json(ImportBatch) },
    404: { description: "Not found", ...json(ProblemDetails) },
    409: { description: "Import batch cannot be reverted", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "patch",
  path: "/v1/accounts/{accountId}/archive",
  security: secured,
  request: { params: accountId, headers: idempotencyKeyHeaders },
  responses: {
    204: {
      description: "Archived, or replayed a prior successful archive",
      headers: optionalReplayHeaders
    },
    404: { description: "Not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/categories",
  security: securedByKeyOrCookie,
  responses: { 200: { description: "Categories", ...json(z.array(Category)) }, ...problemResponses }
});
registry.registerPath({
  method: "post",
  path: "/v1/categories",
  security: secured,
  request: { body: json(CreateCategorySchema), headers: idempotencyKeyHeaders },
  responses: {
    200: {
      description: "Idempotent replay of the created category",
      headers: replayedHeaders,
      ...json(Category)
    },
    201: { description: "Created category", ...json(Category) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "patch",
  path: "/v1/categories/{categoryId}/archive",
  security: secured,
  request: { params: categoryId, headers: idempotencyKeyHeaders },
  responses: {
    204: {
      description: "Archived, or replayed a prior successful archive",
      headers: optionalReplayHeaders
    },
    404: { description: "Not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "patch",
  path: "/v1/categories/{categoryId}/group",
  security: secured,
  request: {
    params: categoryId,
    body: json(UpdateCategoryGroupSchema),
    headers: idempotencyKeyHeaders
  },
  responses: {
    200: {
      description: "Updated category group, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(Category)
    },
    404: { description: "Not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/category-rules",
  security: secured,
  responses: {
    200: { description: "Category rules", ...json(z.array(CategoryRule)) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/category-rules",
  security: secured,
  request: { body: json(CreateCategoryRuleSchema), headers: idempotencyKeyHeaders },
  responses: {
    200: {
      description: "Idempotent replay of the created category rule",
      headers: replayedHeaders,
      ...json(CategoryRule)
    },
    201: { description: "Created category rule", ...json(CategoryRule) },
    404: { description: "Category not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "delete",
  path: "/v1/category-rules/{ruleId}",
  security: secured,
  request: { params: categoryRuleId, headers: idempotencyKeyHeaders },
  responses: {
    204: {
      description: "Deleted, or replayed a prior successful delete",
      headers: optionalReplayHeaders
    },
    404: { description: "Category rule not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/transactions",
  security: secured,
  request: { query: ListTransactionsQuerySchema },
  responses: {
    200: { description: "Transaction page", ...json(TransactionPage) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/transactions",
  security: securedByKeyOrCookie,
  request: {
    body: json(CreateTransactionSchema),
    headers: z.object({ "Idempotency-Key": z.string().uuid() })
  },
  responses: {
    200: { description: "Idempotent replay", ...json(Transaction) },
    201: { description: "Created transaction", ...json(Transaction) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/transactions/{transactionId}",
  security: secured,
  request: { params: transactionId },
  responses: {
    200: { description: "Transaction", ...json(Transaction) },
    404: { description: "Not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "patch",
  path: "/v1/transactions/{transactionId}",
  security: secured,
  request: {
    params: transactionId,
    body: json(UpdateTransactionSchema),
    headers: idempotencyKeyHeaders
  },
  responses: {
    200: {
      description: "Updated transaction, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(Transaction)
    },
    404: { description: "Not found", ...json(ProblemDetails) },
    409: {
      description: "Transfer legs require a group-level metadata operation",
      ...json(ProblemDetails)
    },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/transactions/{transactionId}/reverse",
  security: secured,
  request: { params: transactionId },
  responses: {
    200: {
      description: "Reversal, or natural replay for the already-reversed transaction",
      headers: optionalReplayHeaders,
      ...json(Transaction)
    },
    404: { description: "Not found", ...json(ProblemDetails) },
    409: { description: "Already reversed", ...json(ProblemDetails) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/transfers",
  security: secured,
  request: {
    body: json(CreateTransferSchema),
    headers: idempotencyKeyHeaders
  },
  responses: {
    200: { description: "Idempotent replay", ...json(Transfer) },
    201: { description: "Created transfer", ...json(Transfer) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/transfers/{transferGroupId}/reverse",
  security: secured,
  request: { params: transferGroupId },
  responses: {
    200: {
      description: "Group reversal, or natural replay keyed by the original transfer group",
      headers: optionalReplayHeaders,
      ...json(TransferReversal)
    },
    404: { description: "Not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/assets",
  security: secured,
  request: { body: json(CreateAssetSchema), headers: idempotencyKeyHeaders },
  responses: {
    200: {
      description: "Idempotent replay of the created asset",
      headers: replayedHeaders,
      ...json(Asset)
    },
    201: { description: "Created asset", ...json(Asset) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/assets",
  security: secured,
  responses: {
    200: { description: "Asset list", ...json(z.array(Asset)) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/assets/{assetId}/close",
  security: secured,
  request: { params: assetId, headers: idempotencyKeyHeaders },
  responses: {
    204: {
      description: "Closed, or replayed a prior successful close",
      headers: optionalReplayHeaders
    },
    404: { description: "Not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/assets/{assetId}/valuations",
  security: secured,
  request: {
    params: assetId,
    body: json(CreateValuationSchema),
    headers: idempotencyKeyHeaders
  },
  responses: {
    200: {
      description: "Idempotent replay of the created valuation",
      headers: replayedHeaders,
      ...json(Valuation)
    },
    201: { description: "Created valuation", ...json(Valuation) },
    404: { description: "Not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/assets/{assetId}/valuations",
  security: secured,
  request: { params: assetId },
  responses: {
    200: { description: "Valuations", ...json(ValuationPage) },
    404: { description: "Not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/net-worth",
  security: secured,
  responses: {
    200: { description: "Net worth summary", ...json(NetWorth) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/reports/monthly/{month}",
  security: secured,
  request: { params: month },
  responses: {
    200: { description: "Monthly rollup", ...json(MonthlyRollup) },
    404: { description: "Not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/export/csv",
  security: secured,
  request: { query: ExportCsvQuerySchema },
  responses: {
    200: {
      description: "Posted transactions as a formula-injection-safe CSV attachment",
      headers: z.object({
        "Content-Disposition": z.literal('attachment; filename="treasury-ops-export.csv"')
      }),
      content: {
        "text/csv; charset=utf-8": { schema: z.string() }
      }
    },
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/profile",
  security: secured,
  responses: {
    200: { description: "Current user profile", ...json(UserProfile) },
    404: { description: "Profile not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "patch",
  path: "/v1/profile",
  security: secured,
  request: { body: json(UserProfileUpdateSchema) },
  responses: {
    200: { description: "Updated user profile", ...json(UserProfile) },
    404: { description: "Profile not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/recurring",
  security: secured,
  responses: {
    200: { description: "Recurring rules", ...json(z.array(RecurringRule)) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/recurring",
  security: secured,
  request: { body: json(CreateRecurringRuleSchema), headers: idempotencyKeyHeaders },
  responses: {
    200: {
      description: "Idempotent replay of the created recurring rule",
      headers: replayedHeaders,
      ...json(RecurringRule)
    },
    201: { description: "Created recurring rule", ...json(RecurringRule) },
    404: { description: "Account or category not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "patch",
  path: "/v1/recurring/{ruleId}",
  security: secured,
  request: {
    params: recurringRuleId,
    body: json(UpdateRecurringRuleSchema),
    headers: idempotencyKeyHeaders
  },
  responses: {
    200: {
      description: "Updated recurring rule, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(RecurringRule)
    },
    404: { description: "Recurring rule, account, or category not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/imports",
  security: secured,
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.string().describe("CSV statement file to upload (binary)"),
            accountId: z.string().describe("Account ID to import to"),
            mapping: z.string().describe("JSON string containing ColumnMapping")
          })
        }
      }
    }
  },
  responses: {
    201: { description: "Import batch created", ...json(ImportBatch) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/goals",
  security: secured,
  request: { query: ListGoalsQuerySchema },
  responses: {
    200: { description: "Goals with live progress", ...json(z.array(Goal)) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/goals",
  security: secured,
  request: { body: json(CreateGoalSchema), headers: idempotencyKeyHeaders },
  responses: {
    200: {
      description: "Idempotent replay of the created goal",
      headers: replayedHeaders,
      ...json(Goal)
    },
    201: { description: "Created goal", ...json(Goal) },
    404: { description: "Linked account not found", ...json(ProblemDetails) },
    409: { description: "Funding source already assigned", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "patch",
  path: "/v1/goals/reorder",
  security: secured,
  request: {
    body: json(ReorderGoalsSchema),
    headers: idempotencyKeyHeaders
  },
  responses: {
    204: {
      description: "Goals reordered, or idempotent replay",
      headers: optionalReplayHeaders
    },
    409: { description: "Order does not contain every active goal", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/goals/{goalId}",
  security: secured,
  request: { params: goalId },
  responses: {
    200: { description: "Goal with live progress", ...json(Goal) },
    404: { description: "Goal not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "patch",
  path: "/v1/goals/{goalId}",
  security: secured,
  request: {
    params: goalId,
    body: json(UpdateGoalSchema),
    headers: idempotencyKeyHeaders
  },
  responses: {
    200: {
      description: "Updated goal, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(Goal)
    },
    404: { description: "Goal not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/goals/{goalId}/abandon",
  security: secured,
  request: { params: goalId, headers: idempotencyKeyHeaders },
  responses: {
    204: {
      description: "Goal abandoned, or idempotent replay",
      headers: optionalReplayHeaders
    },
    404: { description: "Active goal not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/goals/{goalId}/plan",
  security: secured,
  request: { params: goalId },
  responses: {
    200: { description: "Goal contribution plan", ...json(GoalPlan) },
    404: { description: "Goal not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/api-keys",
  security: secured,
  request: { body: json(CreateApiKeySchema) },
  responses: {
    201: {
      description: "Created API key (raw key shown once)",
      ...json(CreateApiKeyResponseSchema)
    },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/api-keys",
  security: secured,
  responses: {
    200: { description: "API keys", ...json(z.array(ApiKeySchema)) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "patch",
  path: "/v1/api-keys/{keyId}",
  security: secured,
  request: { params: z.object({ keyId: z.string() }), body: json(UpdateApiKeySchema) },
  responses: { 200: { description: "Updated API key", ...json(ApiKeySchema) }, ...problemResponses }
});
registry.registerPath({
  method: "delete",
  path: "/v1/api-keys/{keyId}",
  security: secured,
  request: { params: z.object({ keyId: z.string() }) },
  responses: { 204: { description: "API key revoked" }, ...problemResponses }
});

registry.registerPath({
  method: "get",
  path: "/v1/dashboard/summary",
  security: secured,
  responses: {
    200: { description: "Home dashboard summary", ...json(DashboardSummary) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/dashboard/recent-activity",
  security: secured,
  request: { query: RecentActivityQuerySchema },
  responses: {
    200: { description: "Most recent posted transactions", ...json(z.array(RecentActivityItem)) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/dashboard/stats",
  security: secured,
  request: { query: DashboardStatsQuerySchema },
  responses: {
    200: {
      description: "Spent/income/savingsRate/netWorth stat cards with trend",
      ...json(DashboardStats)
    },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/dashboard/cashflow",
  security: secured,
  request: { query: CashflowQuerySchema },
  responses: {
    200: {
      description: "Income/expense buckets over the requested range",
      ...json(CashflowResponse)
    },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/dashboard/top-spending",
  security: secured,
  request: { query: TopSpendingQuerySchema },
  responses: {
    200: {
      description: "Top spending categories over the requested range",
      ...json(z.array(TopSpendingItem))
    },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/dashboard/spend-mix",
  security: secured,
  request: { query: SpendMixQuerySchema },
  responses: {
    200: { description: "Essential vs. lifestyle spend split", ...json(SpendMix) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/dashboard/investments",
  security: secured,
  responses: {
    200: {
      description: "Investment/fixed-deposit valuation rollup",
      ...json(DashboardInvestments)
    },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/dashboard/recurring-forecast",
  security: secured,
  request: { query: RecurringForecastQuerySchema },
  responses: {
    200: {
      description: "Upcoming recurring in/out forecast over the requested range",
      ...json(RecurringForecast)
    },
    ...problemResponses
  }
});

registry.registerPath({
  method: "patch",
  path: "/v1/accounts/{accountId}/credit-card-config",
  security: secured,
  request: {
    params: accountId,
    headers: idempotencyKeyHeaders,
    body: json(CreditCardConfigInputSchema)
  },
  responses: {
    200: {
      description: "Configured credit-card cycle, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(Account)
    },
    404: { description: "Account not found", ...json(ProblemDetails) },
    409: { description: "Account is not a credit card", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/bills",
  security: secured,
  request: { query: ListBillsQuerySchema },
  responses: {
    200: { description: "Credit-card bill page", ...json(BillPage) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/bills/{billId}",
  security: secured,
  request: { params: billId },
  responses: {
    200: { description: "Credit-card bill detail", ...json(BillDetail) },
    404: { description: "Bill not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/bills/{billId}/statement",
  security: secured,
  request: {
    params: billId,
    headers: idempotencyKeyHeaders,
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            file: z.string().describe("Issuer CSV statement file to upload (binary)"),
            mapping: z.string().describe("JSON string containing ColumnMapping")
          })
        }
      }
    }
  },
  responses: {
    200: {
      description: "Idempotent statement-upload replay",
      headers: replayedHeaders,
      ...json(BillStatementUpload)
    },
    201: { description: "Statement accepted for parsing", ...json(BillStatementUpload) },
    404: { description: "Bill not found", ...json(ProblemDetails) },
    409: { description: "Bill is already reconciled", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/bills/{billId}/statement/rows",
  security: secured,
  request: { params: billId, query: ListBillStatementRowsQuerySchema },
  responses: {
    200: { description: "Statement reconciliation rows", ...json(BillStatementRowPage) },
    404: { description: "Bill or statement not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "patch",
  path: "/v1/bills/{billId}/statement/rows/{rowId}",
  security: secured,
  request: {
    params: billAndRowId,
    headers: idempotencyKeyHeaders,
    body: json(UpdateBillStatementRowSchema)
  },
  responses: {
    200: {
      description: "Updated reconciliation row, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(BillStatementRow)
    },
    404: { description: "Bill, statement, row, or transaction not found", ...json(ProblemDetails) },
    409: { description: "Statement cannot be changed", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/bills/{billId}/statement/acknowledge-extra",
  security: secured,
  request: {
    params: billId,
    headers: idempotencyKeyHeaders,
    body: json(AcknowledgeExtraTransactionSchema)
  },
  responses: {
    200: {
      description: "Updated extra-ledger acknowledgement, or replay",
      headers: optionalReplayHeaders,
      ...json(BillStatementUpload)
    },
    404: { description: "Bill, statement, or transaction not found", ...json(ProblemDetails) },
    409: { description: "Statement cannot be changed", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/bills/{billId}/statement/reconcile",
  security: secured,
  request: { params: billId, headers: idempotencyKeyHeaders },
  responses: {
    200: {
      description: "Reconciled bill, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(CreditCardBill)
    },
    404: { description: "Bill or statement not found", ...json(ProblemDetails) },
    409: { description: "Statement is not ready or has unresolved rows", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/bills/{billId}/pay",
  security: secured,
  request: {
    params: billId,
    headers: idempotencyKeyHeaders,
    body: json(PayCreditCardBillSchema)
  },
  responses: {
    200: {
      description: "Bill payment, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(BillPaymentResult)
    },
    404: { description: "Bill or payment account not found", ...json(ProblemDetails) },
    409: {
      description: "Bill is unreconciled, paid, or would be overpaid",
      ...json(ProblemDetails)
    },
    ...problemResponses
  }
});

registry.registerComponent("securitySchemes", "cookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "better-auth.session_token"
});
registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer"
});

export { registry };
