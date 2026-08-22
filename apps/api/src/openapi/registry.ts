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

import { extendZodWithOpenApi, OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import {
  BatchCategorizeTransactionsResultSchema,
  BatchCategorizeTransactionsSchema,
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
  CashflowForecastQuerySchema,
  CashflowForecastSnapshotSchema,
  CategoryIdSchema,
  CategorySchema,
  CategoryRuleIdSchema,
  CategoryRuleSchema,
  CategoryRecommendationQuerySchema,
  CategoryRecommendationResponseSchema,
  CreateAccountSchema,
  CreateApiKeyResponseSchema,
  CreateApiKeySchema,
  CreateCategorySchema,
  CreateCategoryRuleSchema,
  CreateCreditCardPaymentSchema,
  CreateTransactionSchema,
  CreditCardBillIdSchema,
  CreditCardBillSchema,
  CreditCardConfigInputSchema,
  CreditCardPaymentResultSchema,
  DashboardInvestmentsSchema,
  DashboardStatsQuerySchema,
  DashboardStatsSchema,
  DashboardSummarySchema,
  MonthlySpendingSchema,
  ExportCsvQuerySchema,
  ListTransactionsQuerySchema,
  ListCategoriesQuerySchema,
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
  TransactionInsightsSchema,
  TransactionPageSchema,
  TransactionSchema,
  UpdateCategoryGroupSchema,
  UpdateCategorySchema,
  UpdateTransactionSchema,
  CreateTransferSchema,
  TransferSchema,
  TransferReversalSchema,
  TransferGroupIdSchema,
  CreateAssetSchema,
  AssetSchema,
  AssetIdSchema,
  BudgetIdSchema,
  BudgetPageSchema,
  BudgetSchema,
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
  CreateSalaryVersionSchema,
  FinancialProfileSchema,
  FinancialProfileStateSchema,
  FinancialProfileUpdateSchema,
  ListSalaryVersionsQuerySchema,
  SalaryStatisticsQuerySchema,
  SalaryStatisticsSchema,
  SalaryVersionPageSchema,
  SalaryVersionSchema,
  CreateDeclaredDebtSchema,
  DeclaredDebtIdSchema,
  DeclaredDebtPageSchema,
  DeclaredDebtSchema,
  ListDeclaredDebtsQuerySchema,
  ProtectionSnapshotSchema,
  ProtectionStateSchema,
  UpdateDeclaredDebtSchema,
  UpsertProtectionSchema,
  MonthSchema,
  MonthlyRollupSchema,
  CreateRecurringRuleSchema,
  CreateGoalSchema,
  CreateGoalContributionSchema,
  GoalContributionSchema,
  GoalIdSchema,
  GoalPlanSchema,
  GoalSchema,
  ListGoalsQuerySchema,
  ListBillsQuerySchema,
  ListBillStatementRowsQuerySchema,
  ListRecurringReconciliationsQuerySchema,
  ListRecurringOccurrencesQuerySchema,
  LinkRecurringOccurrencePaymentSchema,
  RecurringOccurrenceIdSchema,
  RecurringOccurrencePageSchema,
  RecurringOccurrenceSchema,
  RecurringReconciliationReviewItemSchema,
  ReorderGoalsSchema,
  RecurringReconciliationIdSchema,
  RecurringReconciliationSchema,
  RecurringRuleIdSchema,
  RecurringRuleSchema,
  AcceptDetectedStreamSchema,
  DetectedRecurringStreamIdSchema,
  DetectedStreamPageSchema,
  DetectedStreamReviewSchema,
  RejectDetectedStreamSchema,
  RecurringStatsSchema,
  ResolveRecurringReconciliationSchema,
  LinkBillPaymentSchema,
  PayCreditCardBillSchema,
  UpdateApiKeySchema,
  UpdateBillStatementRowSchema,
  UpdateRecurringRuleSchema,
  DismissSpendingWarningResponseSchema,
  ListSpendingWarningsQuerySchema,
  SpendingWarningIdSchema,
  SpendingWarningPageSchema,
  UpdateGoalSchema,
  ListBudgetsQuerySchema,
  UpsertBudgetSchema,
  ConfirmPendingTransactionSchema,
  CreatePendingTransactionSchema,
  ListPendingTransactionsQuerySchema,
  PendingTransactionIdSchema,
  PendingTransactionSchema,
  DismissReviewItemRequestSchema,
  DismissReviewItemResponseSchema,
  ListReviewInboxQuerySchema,
  ReviewInboxPageSchema,
  ReviewInboxSummarySchema,
  ReviewItemIdSchema,
  SubmitReviewFeedbackRequestSchema,
  SubmitReviewFeedbackResponseSchema,
  GoalFeasibilityQuerySchema,
  GoalFeasibilityReportSchema,
  CreateSafetyBufferPreferenceSchema,
  SafetyBufferPreferenceSchema,
  SafetyBufferStateSchema,
  SafetyBufferVersionPageSchema,
  FinancialDiagnosticQuerySchema,
  FinancialDiagnosticSchema,
  EssentialBurnQuerySchema,
  EssentialBurnResponseSchema
} from "@treasury-ops/shared";
import { z } from "zod";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

const Account = AccountSchema.meta({ id: "Account" });
const Category = CategorySchema.meta({ id: "Category" });
const CategoryRule = CategoryRuleSchema.meta({ id: "CategoryRule" });
const CategoryRecommendationResponse = CategoryRecommendationResponseSchema.meta({
  id: "CategoryRecommendationResponse"
});
const Transaction = TransactionSchema.meta({ id: "Transaction" });
const TransactionPage = TransactionPageSchema.meta({ id: "TransactionPage" });
const TransactionInsights = TransactionInsightsSchema.meta({ id: "TransactionInsights" });
const BatchCategorizeTransactionsResult = BatchCategorizeTransactionsResultSchema.meta({
  id: "BatchCategorizeTransactionsResult"
});
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
const FinancialProfile = FinancialProfileSchema.meta({ id: "FinancialProfile" });
const FinancialProfileState = FinancialProfileStateSchema.meta({ id: "FinancialProfileState" });
const SalaryVersion = SalaryVersionSchema.meta({ id: "SalaryVersion" });
const SalaryVersionPage = SalaryVersionPageSchema.meta({ id: "SalaryVersionPage" });
const SalaryStatistics = SalaryStatisticsSchema.meta({ id: "SalaryStatistics" });
const ProtectionState = ProtectionStateSchema.meta({ id: "ProtectionState" });
const ProtectionSnapshot = ProtectionSnapshotSchema.meta({ id: "ProtectionSnapshot" });
const DeclaredDebt = DeclaredDebtSchema.meta({ id: "DeclaredDebt" });
const DeclaredDebtPage = DeclaredDebtPageSchema.meta({ id: "DeclaredDebtPage" });
const MonthlyRollup = MonthlyRollupSchema.meta({ id: "MonthlyRollup" });
const RecurringRule = RecurringRuleSchema.meta({ id: "RecurringRule" });
const DetectedStreamPage = DetectedStreamPageSchema.meta({ id: "DetectedStreamPage" });
const DetectedStreamReview = DetectedStreamReviewSchema.meta({ id: "DetectedStreamReview" });
const RecurringStats = RecurringStatsSchema.meta({ id: "RecurringStats" });
const RecurringReconciliation = RecurringReconciliationSchema.meta({
  id: "RecurringReconciliation"
});
const RecurringReconciliationReviewItem = RecurringReconciliationReviewItemSchema.meta({
  id: "RecurringReconciliationReviewItem"
});
const RecurringOccurrence = RecurringOccurrenceSchema.meta({ id: "RecurringOccurrence" });
const RecurringOccurrencePage = RecurringOccurrencePageSchema.meta({
  id: "RecurringOccurrencePage"
});
const SpendingWarningPage = SpendingWarningPageSchema.meta({ id: "SpendingWarningPage" });
const DismissSpendingWarningResponse = DismissSpendingWarningResponseSchema.meta({
  id: "DismissSpendingWarningResponse"
});
const Budget = BudgetSchema.meta({ id: "Budget" });
const BudgetPage = BudgetPageSchema.meta({ id: "BudgetPage" });
const Goal = GoalSchema.meta({ id: "Goal" });
const GoalContribution = GoalContributionSchema.meta({ id: "GoalContribution" });
const GoalPlan = GoalPlanSchema.meta({ id: "GoalPlan" });
const PendingTransaction = PendingTransactionSchema.meta({ id: "PendingTransaction" });
const DashboardSummary = DashboardSummarySchema.meta({ id: "DashboardSummary" });
const RecentActivityItem = RecentActivityItemSchema.meta({ id: "RecentActivityItem" });
const DashboardStats = DashboardStatsSchema.meta({ id: "DashboardStats" });
const CashflowResponse = CashflowResponseSchema.meta({ id: "CashflowResponse" });
const CashflowForecastSnapshot = CashflowForecastSnapshotSchema.meta({
  id: "CashflowForecastSnapshot"
});
const MonthlySpending = MonthlySpendingSchema.meta({ id: "MonthlySpending" });
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
const CreditCardPaymentResult = CreditCardPaymentResultSchema.meta({
  id: "CreditCardPaymentResult"
});
const ReviewInboxPage = ReviewInboxPageSchema.meta({ id: "ReviewInboxPage" });
const ReviewInboxSummary = ReviewInboxSummarySchema.meta({ id: "ReviewInboxSummary" });
const DismissReviewItemResponse = DismissReviewItemResponseSchema.meta({
  id: "DismissReviewItemResponse"
});
const SubmitReviewFeedbackResponse = SubmitReviewFeedbackResponseSchema.meta({
  id: "SubmitReviewFeedbackResponse"
});
const GoalFeasibilityReport = GoalFeasibilityReportSchema.meta({ id: "GoalFeasibilityReport" });
const SafetyBufferPreference = SafetyBufferPreferenceSchema.meta({ id: "SafetyBufferPreference" });
const SafetyBufferState = SafetyBufferStateSchema.meta({ id: "SafetyBufferState" });
const SafetyBufferVersionPage = SafetyBufferVersionPageSchema.meta({
  id: "SafetyBufferVersionPage"
});
const FinancialDiagnostic = FinancialDiagnosticSchema.meta({ id: "FinancialDiagnostic" });
const EssentialBurnResponse = EssentialBurnResponseSchema.meta({ id: "EssentialBurnResponse" });

const reviewItemId = z.object({ id: ReviewItemIdSchema });

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
const detectedStreamId = z.object({ streamId: DetectedRecurringStreamIdSchema });
const detectedStreamsQuery = z.object({
  cursor: z
    .string()
    .uuid()
    .optional()
    .openapi({ param: { name: "cursor", in: "query" } }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .openapi({ param: { name: "limit", in: "query" } }),
  state: z
    .enum(["candidate", "mature", "stale"])
    .optional()
    .openapi({ param: { name: "state", in: "query" } })
});
const recurringRuleAndOccurrenceId = z.object({
  ruleId: RecurringRuleIdSchema,
  occurrenceId: RecurringOccurrenceIdSchema
});
const recurringReconciliationId = z.object({ id: RecurringReconciliationIdSchema });
const spendingWarningId = z.object({ warningId: SpendingWarningIdSchema });
const goalId = z.object({ goalId: GoalIdSchema });
const billId = z.object({ billId: CreditCardBillIdSchema });
const billAndRowId = z.object({
  billId: CreditCardBillIdSchema,
  rowId: BillStatementRowIdSchema
});
const budgetId = z.object({ budgetId: BudgetIdSchema });
const declaredDebtId = z.object({ debtId: DeclaredDebtIdSchema });
const pendingTransactionId = z.object({ id: PendingTransactionIdSchema });
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
const idempotencyConflictResponse = {
  409: {
    description: "Idempotency key was already used for different request intent",
    ...json(ProblemDetails)
  }
};

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
    ...idempotencyConflictResponse,
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
  method: "patch",
  path: "/v1/transactions",
  operationId: "batchCategorizeTransactions",
  security: secured,
  request: {
    body: json(BatchCategorizeTransactionsSchema),
    headers: idempotencyKeyHeaders
  },
  responses: {
    200: {
      description: "Assigned one category to the selected transactions, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(BatchCategorizeTransactionsResult)
    },
    404: { description: "Category or transaction not found", ...json(ProblemDetails) },
    409: {
      description:
        "Category kind, transfer metadata, or idempotency intent conflicts with the batch",
      ...json(ProblemDetails)
    },
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
    202: { description: "Commit workflow accepted", ...json(ImportBatch) },
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
    202: { description: "Revert workflow accepted", ...json(ImportBatch) },
    404: { description: "Not found", ...json(ProblemDetails) },
    409: { description: "Import batch cannot be reverted", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "delete",
  path: "/v1/imports/{importBatchId}",
  security: secured,
  request: { params: importBatchId },
  responses: {
    204: { description: "Deleted" },
    404: { description: "Not found", ...json(ProblemDetails) },
    409: { description: "Import batch cannot be deleted", ...json(ProblemDetails) },
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
    ...idempotencyConflictResponse,
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/categories",
  security: securedByKeyOrCookie,
  request: { query: ListCategoriesQuerySchema },
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
    ...idempotencyConflictResponse,
    ...problemResponses
  }
});
registry.registerPath({
  method: "put",
  path: "/v1/categories/{categoryId}",
  security: secured,
  request: {
    params: categoryId,
    body: json(UpdateCategorySchema),
    headers: idempotencyKeyHeaders
  },
  responses: {
    200: {
      description: "Updated category, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(Category)
    },
    404: { description: "Category not found", ...json(ProblemDetails) },
    409: { description: "Name or hierarchy conflict", ...json(ProblemDetails) },
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
    ...idempotencyConflictResponse,
    ...problemResponses
  }
});
registry.registerPath({
  method: "patch",
  path: "/v1/categories/{categoryId}/unarchive",
  security: secured,
  request: { params: categoryId, headers: idempotencyKeyHeaders },
  responses: {
    200: {
      description: "Restored category, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(Category)
    },
    404: { description: "Archived category not found", ...json(ProblemDetails) },
    409: { description: "Active sibling name or parent conflict", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "delete",
  path: "/v1/categories/{categoryId}/permanent",
  security: secured,
  request: { params: categoryId, headers: idempotencyKeyHeaders },
  responses: {
    204: {
      description: "Permanently deleted, or replayed a prior successful delete",
      headers: optionalReplayHeaders
    },
    404: { description: "Category not found", ...json(ProblemDetails) },
    409: { description: "Category is active or still has linked records", ...json(ProblemDetails) },
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
    ...idempotencyConflictResponse,
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
    ...idempotencyConflictResponse,
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
    ...idempotencyConflictResponse,
    ...problemResponses
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/category-recommendations/query",
  operationId: "queryCategoryRecommendations",
  description:
    "Read-only personal category recommendations for the signed-in user. Has no side effects and does not persist results.",
  security: secured,
  request: { body: json(CategoryRecommendationQuerySchema) },
  responses: {
    200: {
      description: "Deterministic personal category recommendations",
      ...json(CategoryRecommendationResponse)
    },
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/transactions",
  operationId: "listTransactions",
  security: secured,
  request: { query: ListTransactionsQuerySchema },
  responses: {
    200: { description: "Transaction page", ...json(TransactionPage) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/transactions/insights",
  operationId: "getTransactionInsights",
  security: secured,
  responses: {
    200: { description: "Current IST-month transaction insights", ...json(TransactionInsights) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/transactions",
  operationId: "createTransaction",
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
  operationId: "getTransaction",
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
  operationId: "updateTransaction",
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
      description:
        "Transfer legs require a group-level metadata operation, or idempotency intent conflicts",
      ...json(ProblemDetails)
    },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/transactions/{transactionId}/reverse",
  operationId: "reverseTransaction",
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
  operationId: "createTransfer",
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
  operationId: "reverseTransfer",
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
    ...idempotencyConflictResponse,
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
    ...idempotencyConflictResponse,
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
    ...idempotencyConflictResponse,
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
  path: "/v1/financial-profile",
  security: secured,
  responses: {
    200: {
      description: "Salary and work profile state, or an explicit unconfigured setup state",
      ...json(FinancialProfileState)
    },
    ...problemResponses
  }
});
registry.registerPath({
  method: "patch",
  path: "/v1/financial-profile",
  security: secured,
  request: { body: json(FinancialProfileUpdateSchema), headers: idempotencyKeyHeaders },
  responses: {
    200: {
      description: "Saved work profile, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(FinancialProfile)
    },
    ...idempotencyConflictResponse,
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/financial-profile/salary-versions",
  security: secured,
  request: { query: ListSalaryVersionsQuerySchema },
  responses: {
    200: {
      description: "Salary version history, newest effective date first",
      ...json(SalaryVersionPage)
    },
    400: { description: "Invalid cursor", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/financial-profile/salary-versions",
  security: secured,
  request: { body: json(CreateSalaryVersionSchema), headers: idempotencyKeyHeaders },
  responses: {
    200: {
      description: "Idempotent replay of the appended salary version",
      headers: replayedHeaders,
      ...json(SalaryVersion)
    },
    201: { description: "Appended salary version", ...json(SalaryVersion) },
    ...idempotencyConflictResponse,
    ...problemResponses,
    409: {
      description:
        "A salary version already exists for this effective date, or the idempotency key was reused with a different request intent",
      ...json(ProblemDetails)
    }
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/financial-profile/salary-statistics",
  security: secured,
  request: { query: SalaryStatisticsQuerySchema },
  responses: {
    200: {
      description: "Derived net-salary statistics for the effective salary version",
      ...json(SalaryStatistics)
    },
    ...problemResponses,
    422: {
      description: "Validation failed, or the salary and work profile has not been set up yet",
      ...json(ProblemDetails)
    }
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/financial-profile/protection",
  security: secured,
  responses: {
    200: {
      description:
        "Protection state: the effective snapshot, any future-dated snapshot, and explicit per-cover states. An unconfigured user gets configured=false, never a safe default.",
      ...json(ProtectionState)
    },
    ...problemResponses
  }
});
registry.registerPath({
  method: "put",
  path: "/v1/financial-profile/protection",
  security: secured,
  request: { body: json(UpsertProtectionSchema), headers: idempotencyKeyHeaders },
  responses: {
    200: {
      description: "Idempotent replay of the appended protection snapshot",
      headers: replayedHeaders,
      ...json(ProtectionSnapshot)
    },
    201: {
      description: "Appended effective-dated protection snapshot",
      ...json(ProtectionSnapshot)
    },
    ...idempotencyConflictResponse,
    ...problemResponses,
    409: {
      description:
        "A protection snapshot already exists for this effective date, or the idempotency key was reused with a different request intent",
      ...json(ProblemDetails)
    }
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/financial-profile/debts",
  security: secured,
  request: { query: ListDeclaredDebtsQuerySchema },
  responses: {
    200: {
      description:
        "Declared debts, newest first, defaulting to active. Linked debts derive their outstanding amount from the linked loan-liability asset's latest valuation; declared amounts are flagged as estimates.",
      ...json(DeclaredDebtPage)
    },
    400: { description: "Invalid cursor", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/financial-profile/debts",
  security: secured,
  request: { body: json(CreateDeclaredDebtSchema), headers: idempotencyKeyHeaders },
  responses: {
    200: {
      description: "Idempotent replay of the declared debt",
      headers: replayedHeaders,
      ...json(DeclaredDebt)
    },
    201: { description: "Declared debt", ...json(DeclaredDebt) },
    404: {
      description: "The asset to link is not an open loan liability owned by this user",
      ...json(ProblemDetails)
    },
    ...idempotencyConflictResponse,
    ...problemResponses
  }
});
registry.registerPath({
  method: "patch",
  path: "/v1/financial-profile/debts/{debtId}",
  security: secured,
  request: {
    params: declaredDebtId,
    body: json(UpdateDeclaredDebtSchema),
    headers: idempotencyKeyHeaders
  },
  responses: {
    200: {
      description:
        "Updated debt metadata, or the same debt resolved. Resolving removes the debt from active planning checks; it moves no money and changes no asset.",
      headers: optionalReplayHeaders,
      ...json(DeclaredDebt)
    },
    404: { description: "Declared debt not found", ...json(ProblemDetails) },
    ...idempotencyConflictResponse,
    ...problemResponses,
    409: {
      description:
        "The debt is already resolved, its amount is derived from a linked asset, or the idempotency key was reused with a different request intent",
      ...json(ProblemDetails)
    }
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/financial-profile/diagnostic",
  security: secured,
  request: { query: FinancialDiagnosticQuerySchema },
  responses: {
    200: {
      description:
        "Composed server-authoritative financial readiness diagnostic measuring data completeness and available capabilities",
      ...json(FinancialDiagnostic)
    },
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
  method: "get",
  path: "/v1/recurring/detected",
  security: secured,
  request: { query: detectedStreamsQuery },
  responses: {
    200: {
      description: "Pending detected recurring streams, newest first",
      ...json(DetectedStreamPage)
    },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/recurring/detected/{streamId}/accept",
  security: secured,
  request: {
    params: detectedStreamId,
    body: json(AcceptDetectedStreamSchema),
    headers: idempotencyKeyHeaders
  },
  responses: {
    200: {
      description: "Accepted recurring rule or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(RecurringRule)
    },
    ...idempotencyConflictResponse,
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/recurring/detected/{streamId}/reject",
  security: secured,
  request: {
    params: detectedStreamId,
    body: json(RejectDetectedStreamSchema),
    headers: idempotencyKeyHeaders
  },
  responses: {
    200: {
      description: "Rejected stream decision or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(DetectedStreamReview)
    },
    ...idempotencyConflictResponse,
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/recurring/stats",
  security: secured,
  responses: {
    200: {
      description: "Recurring rule statistics with 30-day and rolling 12-month forecasts",
      ...json(RecurringStats)
    },
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
    ...idempotencyConflictResponse,
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
    ...idempotencyConflictResponse,
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/recurring/occurrences/outstanding",
  security: secured,
  responses: {
    200: {
      description: "Outstanding (expected/missed) occurrences across all manual-post rules",
      ...json(z.array(RecurringOccurrence))
    },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/recurring/{ruleId}/occurrences",
  security: secured,
  request: { params: recurringRuleId, query: ListRecurringOccurrencesQuerySchema },
  responses: {
    200: {
      description: "Occurrence history for a manual-post recurring rule",
      ...json(RecurringOccurrencePage)
    },
    404: { description: "Recurring rule not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/recurring/{ruleId}/occurrences/{occurrenceId}/link-payment",
  security: secured,
  request: {
    params: recurringRuleAndOccurrenceId,
    body: json(LinkRecurringOccurrencePaymentSchema),
    headers: idempotencyKeyHeaders
  },
  responses: {
    200: {
      description: "Confirmed occurrence, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(RecurringOccurrence)
    },
    404: {
      description: "Recurring rule, occurrence, or transaction not found",
      ...json(ProblemDetails)
    },
    409: {
      description: "Transaction is not an eligible source, or the occurrence is already confirmed",
      ...json(ProblemDetails)
    },
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/recurring/reconciliations",
  security: secured,
  request: { query: ListRecurringReconciliationsQuerySchema },
  responses: {
    200: {
      description: "Pending recurring reconciliations awaiting review",
      ...json(z.array(RecurringReconciliationReviewItem))
    },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/recurring/reconciliations/{id}/resolve",
  security: secured,
  request: {
    params: recurringReconciliationId,
    body: json(ResolveRecurringReconciliationSchema),
    headers: idempotencyKeyHeaders
  },
  responses: {
    200: {
      description: "Resolved reconciliation, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(RecurringReconciliation)
    },
    404: { description: "Recurring reconciliation not found", ...json(ProblemDetails) },
    409: {
      description: "Already resolved, or idempotency key reused for a different request",
      ...json(ProblemDetails)
    },
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/spending-warnings",
  security: secured,
  request: { query: ListSpendingWarningsQuerySchema },
  responses: {
    200: {
      description: "Active spending warnings and analysis coverage",
      ...json(SpendingWarningPage)
    },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/spending-warnings/{warningId}/dismiss",
  security: secured,
  request: { params: spendingWarningId, headers: idempotencyKeyHeaders },
  responses: {
    200: {
      description: "Dismissed warning, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(DismissSpendingWarningResponse)
    },
    404: { description: "Not found", ...json(ProblemDetails) },
    ...idempotencyConflictResponse,
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
    202: { description: "Import parse workflow accepted", ...json(ImportBatch) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/goals/feasibility",
  security: secured,
  request: { query: GoalFeasibilityQuerySchema },
  responses: {
    200: {
      description: "Goal feasibility report and deterministic scenarios",
      ...json(GoalFeasibilityReport)
    },
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
    409: {
      description: "Funding source already assigned, or idempotency intent conflicts",
      ...json(ProblemDetails)
    },
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
    409: {
      description: "Order is invalid, or idempotency intent conflicts",
      ...json(ProblemDetails)
    },
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
    ...idempotencyConflictResponse,
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
    ...idempotencyConflictResponse,
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
  method: "get",
  path: "/v1/goals/{goalId}/contributions",
  security: secured,
  request: { params: goalId },
  responses: {
    200: { description: "Goal contributions list", ...json(z.array(GoalContribution)) },
    404: { description: "Goal not found", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/goals/{goalId}/contributions",
  security: secured,
  request: {
    params: goalId,
    body: json(CreateGoalContributionSchema),
    headers: idempotencyKeyHeaders
  },
  responses: {
    200: {
      description: "Goal with updated progress after contribution recorded, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(Goal)
    },
    404: { description: "Goal not found", ...json(ProblemDetails) },
    ...idempotencyConflictResponse,
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/budgets",
  security: secured,
  request: { query: ListBudgetsQuerySchema },
  responses: {
    200: { description: "Budget page with live progress and overview totals", ...json(BudgetPage) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "put",
  path: "/v1/budgets/{categoryId}",
  security: secured,
  request: {
    params: categoryId,
    body: json(UpsertBudgetSchema),
    headers: idempotencyKeyHeaders
  },
  responses: {
    200: {
      description: "Created, updated, restored budget configuration, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(Budget)
    },
    404: { description: "Category not found", ...json(ProblemDetails) },
    ...idempotencyConflictResponse,
    ...problemResponses
  }
});
registry.registerPath({
  method: "patch",
  path: "/v1/budgets/{budgetId}/archive",
  security: secured,
  request: { params: budgetId, headers: idempotencyKeyHeaders },
  responses: {
    200: {
      description: "Archived budget configuration, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(Budget)
    },
    404: { description: "Budget not found", ...json(ProblemDetails) },
    ...idempotencyConflictResponse,
    ...problemResponses
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/api-keys",
  security: secured,
  request: { body: json(CreateApiKeySchema), headers: idempotencyKeyHeaders },
  responses: {
    200: {
      description: "Idempotent replay of the created API key (raw key shown once)",
      headers: replayedHeaders,
      ...json(CreateApiKeyResponseSchema)
    },
    201: {
      description: "Created API key (raw key shown once)",
      ...json(CreateApiKeyResponseSchema)
    },
    ...idempotencyConflictResponse,
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
  path: "/v1/insights/cash-flow-forecast",
  security: secured,
  request: { query: CashflowForecastQuerySchema },
  responses: {
    200: {
      description:
        "Latest immutable, read-only cash-flow forecast snapshot; null while worker evidence is unavailable",
      ...json(CashflowForecastSnapshot.nullable())
    },
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/dashboard/monthly-spending",
  security: secured,
  responses: {
    200: {
      description: "Current IST calendar-month spending with daily and elapsed weekly buckets",
      ...json(MonthlySpending)
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
  method: "get",
  path: "/v1/metrics",
  security: secured,
  responses: {
    200: {
      description: "Prometheus text exposition for backend runtime health",
      content: { "text/plain": { schema: z.string() } }
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
registry.registerPath({
  method: "post",
  path: "/v1/credit-card-payments",
  security: secured,
  request: {
    headers: idempotencyKeyHeaders,
    body: json(CreateCreditCardPaymentSchema)
  },
  responses: {
    200: {
      description:
        "Existing expense linked to a credit-card account, with optional bill attribution, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(CreditCardPaymentResult)
    },
    404: { description: "Transaction, bill, or account not found", ...json(ProblemDetails) },
    409: {
      description:
        "Transaction is ineligible, target account or bill does not match, or the bill would be overpaid",
      ...json(ProblemDetails)
    },
    ...problemResponses
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/bills/{billId}/link-payment",
  security: secured,
  request: {
    params: billId,
    headers: idempotencyKeyHeaders,
    body: json(LinkBillPaymentSchema)
  },
  responses: {
    200: {
      description: "Bill payment linked to an existing transaction, or idempotent replay",
      headers: optionalReplayHeaders,
      ...json(BillPaymentResult)
    },
    404: { description: "Bill or transaction not found", ...json(ProblemDetails) },
    409: {
      description: "Transaction is not an eligible payment source, or the bill would be overpaid",
      ...json(ProblemDetails)
    },
    ...problemResponses
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/pending-transactions",
  operationId: "createPendingTransaction",
  security: securedByKeyOrCookie,
  request: { body: json(CreatePendingTransactionSchema), headers: idempotencyKeyHeaders },
  responses: {
    200: {
      description: "Idempotent replay of the created pending transaction",
      headers: replayedHeaders,
      ...json(PendingTransaction)
    },
    201: { description: "Created pending transaction", ...json(PendingTransaction) },
    404: { description: "Account not found", ...json(ProblemDetails) },
    ...idempotencyConflictResponse,
    ...problemResponses
  }
});
registry.registerPath({
  method: "get",
  path: "/v1/pending-transactions",
  operationId: "listPendingTransactions",
  security: secured,
  request: { query: ListPendingTransactionsQuerySchema },
  responses: {
    200: { description: "Pending transactions page", ...json(z.array(PendingTransaction)) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/pending-transactions/{id}/confirm",
  operationId: "confirmPendingTransaction",
  security: secured,
  request: {
    params: pendingTransactionId,
    body: json(ConfirmPendingTransactionSchema),
    headers: idempotencyKeyHeaders
  },
  responses: {
    200: {
      description: "Pending transaction confirmed into a real transaction",
      ...json(PendingTransaction)
    },
    404: { description: "Pending transaction not found", ...json(ProblemDetails) },
    409: { description: "Pending transaction was already dismissed", ...json(ProblemDetails) },
    ...problemResponses
  }
});
registry.registerPath({
  method: "post",
  path: "/v1/pending-transactions/{id}/dismiss",
  operationId: "dismissPendingTransaction",
  security: secured,
  request: { params: pendingTransactionId, headers: idempotencyKeyHeaders },
  responses: {
    204: {
      description: "Pending transaction dismissed, or idempotent replay",
      headers: optionalReplayHeaders
    },
    404: { description: "Pending transaction not found", ...json(ProblemDetails) },
    ...idempotencyConflictResponse,
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/review-inbox",
  security: secured,
  request: { query: ListReviewInboxQuerySchema },
  responses: {
    200: {
      description: "Prioritized list of review inbox items",
      ...json(ReviewInboxPage)
    },
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/review-inbox/summary",
  security: secured,
  responses: {
    200: {
      description: "Summary counts and urgency statistics for the review inbox",
      ...json(ReviewInboxSummary)
    },
    ...problemResponses
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/review-inbox/sync",
  security: secured,
  responses: {
    200: {
      description: "Triggered synchronization of review items",
      ...json(z.object({ syncedCount: z.number().int() }))
    },
    ...problemResponses
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/review-inbox/{id}/dismiss",
  security: secured,
  request: {
    params: reviewItemId,
    headers: idempotencyKeyHeaders,
    body: {
      content: {
        "application/json": {
          schema: DismissReviewItemRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "Dismissed review item",
      headers: optionalReplayHeaders,
      ...json(DismissReviewItemResponse)
    },
    404: { description: "Review item not found", ...json(ProblemDetails) },
    ...idempotencyConflictResponse,
    ...problemResponses
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/review-inbox/{id}/feedback",
  security: secured,
  request: {
    params: reviewItemId,
    headers: idempotencyKeyHeaders,
    body: {
      content: {
        "application/json": {
          schema: SubmitReviewFeedbackRequestSchema
        }
      }
    }
  },
  responses: {
    200: {
      description: "Resolved review item with user feedback",
      headers: optionalReplayHeaders,
      ...json(SubmitReviewFeedbackResponse)
    },
    404: { description: "Review item not found", ...json(ProblemDetails) },
    ...idempotencyConflictResponse,
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/safety-buffer",
  security: secured,
  responses: {
    200: { description: "Current safety buffer state and preferences", ...json(SafetyBufferState) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "post",
  path: "/v1/safety-buffer",
  security: secured,
  request: { body: json(CreateSafetyBufferPreferenceSchema), headers: idempotencyKeyHeaders },
  responses: {
    200: {
      description: "Idempotent replay of the safety buffer preference",
      headers: replayedHeaders,
      ...json(SafetyBufferPreference)
    },
    201: {
      description: "Created safety buffer preference version",
      ...json(SafetyBufferPreference)
    },
    404: { description: "Linked emergency fund goal not found", ...json(ProblemDetails) },
    ...idempotencyConflictResponse,
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/safety-buffer/versions",
  security: secured,
  request: {
    query: z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50).optional()
    })
  },
  responses: {
    200: { description: "Safety buffer version history", ...json(SafetyBufferVersionPage) },
    ...problemResponses
  }
});

registry.registerPath({
  method: "get",
  path: "/v1/financial-safety/essential-burn",
  security: secured,
  request: { query: EssentialBurnQuerySchema },
  responses: {
    200: {
      description: "Trailing essential burn baseline derived from append-only ledger history",
      ...json(EssentialBurnResponse)
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
