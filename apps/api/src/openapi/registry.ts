/**
 * @file registry.ts
 * @description OpenAPI Specification Registry.
 *
 * This file serves as the single source of truth for the API specification.
 * It uses `@asteasolutions/zod-to-openapi` to declare endpoints and map request/response
 * structures to Zod schemas imported from `@vyaya/shared`.
 *
 * DESIGN INVARIANTS:
 * 1. Schema Derivation: Never duplicate schema structures. All schemas used here
 *    MUST be imported directly from `@vyaya/shared`.
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
  CategoryIdSchema,
  CategorySchema,
  CategoryRuleIdSchema,
  CategoryRuleSchema,
  CreateAccountSchema,
  CreateCategorySchema,
  CreateCategoryRuleSchema,
  CreateTransactionSchema,
  ExportCsvQuerySchema,
  ListTransactionsQuerySchema,
  ProblemDetailsSchema,
  TransactionIdSchema,
  TransactionPageSchema,
  TransactionSchema,
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
  MonthSchema,
  MonthlyRollupSchema,
  CreateRecurringRuleSchema,
  RecurringRuleIdSchema,
  RecurringRuleSchema,
  UpdateRecurringRuleSchema
} from "@vyaya/shared";
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
const json = (schema: z.ZodType): { content: { "application/json": { schema: z.ZodType } } } => ({
  content: { "application/json": { schema } }
});
const problemResponses = {
  401: { description: "Unauthenticated", ...json(ProblemDetails) },
  422: { description: "Validation failed", ...json(ProblemDetails) },
  500: { description: "Internal error", ...json(ProblemDetails) }
};
const secured = [{ cookieAuth: [] }];
const idempotencyKeyHeaders = z.object({ "Idempotency-Key": z.string().uuid() });
const replayedHeaders = z.object({ "Idempotency-Replayed": z.literal("true") });
const optionalReplayHeaders = z.object({
  "Idempotency-Replayed": z.literal("true").optional()
});

registry.registerPath({
  method: "get",
  path: "/v1/accounts",
  security: secured,
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
  security: secured,
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
  security: secured,
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
        "Content-Disposition": z.literal('attachment; filename="vyaya-export.csv"')
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

registry.registerComponent("securitySchemes", "cookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "better-auth.session_token"
});

export { registry };
