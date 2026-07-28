import { ImportBatchIdSchema } from "@treasury-ops/shared";
import { z } from "zod";

export const ImportWorkflowOperationSchema = z.enum(["parse", "commit", "revert"]);

export type ImportWorkflowOperation = z.infer<typeof ImportWorkflowOperationSchema>;

export const ImportWorkflowJobDataSchema = z.object({
  batchId: ImportBatchIdSchema,
  userId: z.string().min(1),
  operation: ImportWorkflowOperationSchema,
  claimToken: z.string().uuid(),
  correlationId: z.string().min(1).max(128)
});

export type ImportWorkflowJobData = z.infer<typeof ImportWorkflowJobDataSchema>;

export type ClaimedImportWorkflow = ImportWorkflowJobData;
