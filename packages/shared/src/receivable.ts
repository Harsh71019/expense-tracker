import { z } from "zod";

import { AccountIdSchema } from "./account.js";
import { PageInfoSchema } from "./pagination.js";
import { TransactionIdSchema } from "./transaction.js";

const PositiveMinorSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const NonNegativeMinorSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const CounterpartyNameSchema = z.string().trim().min(1).max(80);
const ReceivableNoteSchema = z.string().trim().max(500);
const CorrectionReasonSchema = z.string().trim().min(1).max(300);

export const ReceivableIdSchema = z.string().uuid("Receivable id must be a UUID.");
export const ReceivableEventIdSchema = z.string().uuid("Receivable event id must be a UUID.");
export const ReceivableStatusSchema = z.enum(["active", "settled", "cancelled"]);
export const ReceivableEventKindSchema = z.enum([
  "opening",
  "repayment",
  "correction_increase",
  "correction_decrease",
  "legacy_increase",
  "legacy_decrease"
]);

const ReceivableOpenDatesShape = {
  openedAt: z.coerce.date(),
  dueAt: z.coerce.date().optional()
};

function refineDueNotBeforeOpened<T extends { openedAt: Date; dueAt?: Date | undefined }>(
  value: T
) {
  return value.dueAt === undefined || value.dueAt.getTime() >= value.openedAt.getTime();
}

export const CreateReceivableSchema = z.discriminatedUnion("fundingMode", [
  z
    .object({
      fundingMode: z.literal("lend_now"),
      counterpartyName: CounterpartyNameSchema,
      principalMinor: PositiveMinorSchema,
      accountId: AccountIdSchema,
      ...ReceivableOpenDatesShape,
      note: ReceivableNoteSchema.optional(),
      description: z.string().trim().min(1).max(500)
    })
    .strict()
    .refine(refineDueNotBeforeOpened, {
      message: "dueAt must not precede openedAt.",
      path: ["dueAt"]
    }),
  z
    .object({
      fundingMode: z.literal("opening_balance"),
      counterpartyName: CounterpartyNameSchema,
      outstandingMinor: PositiveMinorSchema,
      ...ReceivableOpenDatesShape,
      note: ReceivableNoteSchema.optional()
    })
    .strict()
    .refine(refineDueNotBeforeOpened, {
      message: "dueAt must not precede openedAt.",
      path: ["dueAt"]
    })
]);

export const UpdateReceivableMetadataSchema = z
  .object({
    counterpartyName: CounterpartyNameSchema.optional(),
    note: ReceivableNoteSchema.nullable().optional(),
    dueAt: z.coerce.date().nullable().optional()
  })
  .strict()
  .refine(
    (value) =>
      value.counterpartyName !== undefined || value.note !== undefined || value.dueAt !== undefined,
    { message: "At least one field must be provided." }
  );

export const RecordReceivableRepaymentSchema = z.discriminatedUnion("captureMode", [
  z
    .object({
      captureMode: z.literal("receive_now"),
      accountId: AccountIdSchema,
      amountMinor: PositiveMinorSchema,
      occurredAt: z.coerce.date(),
      description: z.string().trim().min(1).max(500)
    })
    .strict(),
  z
    .object({
      captureMode: z.literal("link_existing"),
      transactionId: TransactionIdSchema
    })
    .strict()
]);

export const CreateReceivableCorrectionSchema = z
  .object({
    direction: z.enum(["increase", "decrease"]),
    amountMinor: PositiveMinorSchema,
    reason: CorrectionReasonSchema
  })
  .strict();

export const ListReceivablesQuerySchema = z.object({
  status: z.enum(["active", "settled", "cancelled", "all"]).default("active"),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const ListReceivableEventsQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const ReceivableEventSchema = z.object({
  id: ReceivableEventIdSchema,
  receivableId: ReceivableIdSchema,
  kind: ReceivableEventKindSchema,
  amountMinor: PositiveMinorSchema,
  occurredAt: z.coerce.date(),
  transactionId: TransactionIdSchema.optional(),
  reason: CorrectionReasonSchema.optional(),
  isReversed: z.boolean(),
  createdAt: z.coerce.date()
});

export const ReceivableSchema = z.object({
  id: ReceivableIdSchema,
  counterpartyName: CounterpartyNameSchema,
  note: ReceivableNoteSchema.optional(),
  openedAt: z.coerce.date(),
  dueAt: z.coerce.date().optional(),
  outstandingMinor: NonNegativeMinorSchema,
  confirmedRepaidMinor: NonNegativeMinorSchema,
  repaymentCount: z.number().int().min(0),
  status: ReceivableStatusSchema,
  isMigrated: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const ReceivablePageSchema = z.object({
  items: z.array(ReceivableSchema),
  pageInfo: PageInfoSchema
});

export const ReceivableEventPageSchema = z.object({
  items: z.array(ReceivableEventSchema),
  pageInfo: PageInfoSchema
});

export const ReceivableMutationResultSchema = z.object({
  receivable: ReceivableSchema,
  event: ReceivableEventSchema,
  transactionId: TransactionIdSchema.optional()
});

export const NetWorthReceivableSchema = z.object({
  receivableId: ReceivableIdSchema,
  counterpartyName: CounterpartyNameSchema,
  outstandingMinor: NonNegativeMinorSchema,
  asOf: z.coerce.date()
});

export type ReceivableId = z.infer<typeof ReceivableIdSchema>;
export type ReceivableEventId = z.infer<typeof ReceivableEventIdSchema>;
export type ReceivableStatus = z.infer<typeof ReceivableStatusSchema>;
export type ReceivableEventKind = z.infer<typeof ReceivableEventKindSchema>;
export type CreateReceivable = z.infer<typeof CreateReceivableSchema>;
export type UpdateReceivableMetadata = z.infer<typeof UpdateReceivableMetadataSchema>;
export type RecordReceivableRepayment = z.infer<typeof RecordReceivableRepaymentSchema>;
export type CreateReceivableCorrection = z.infer<typeof CreateReceivableCorrectionSchema>;
export type ListReceivablesQuery = z.infer<typeof ListReceivablesQuerySchema>;
export type ListReceivableEventsQuery = z.infer<typeof ListReceivableEventsQuerySchema>;
export type ReceivableEvent = z.infer<typeof ReceivableEventSchema>;
export type Receivable = z.infer<typeof ReceivableSchema>;
export type ReceivablePage = z.infer<typeof ReceivablePageSchema>;
export type ReceivableEventPage = z.infer<typeof ReceivableEventPageSchema>;
export type ReceivableMutationResult = z.infer<typeof ReceivableMutationResultSchema>;
export type NetWorthReceivable = z.infer<typeof NetWorthReceivableSchema>;
