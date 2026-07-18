import { z } from "zod";

import { AccountIdSchema } from "./account.js";
import { PageInfoSchema } from "./pagination.js";

const SignedMinorSchema = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);

export const AssetKindSchema = z.enum([
  "loan_receivable",
  "loan_liability",
  "fixed_deposit",
  "gold",
  "silver",
  "investment"
]);

export const AssetIdSchema = z.string().uuid("Asset id must be a UUID.");

export const CreateAssetSchema = z
  .object({
    kind: AssetKindSchema,
    name: z.string().trim().min(1).max(80),
    openedAt: z.coerce.date(),
    maturityAt: z.coerce.date().optional(),
    annualRateBps: z.number().int().min(0).max(100_00).optional(),
    quantityMilliUnits: z.number().int().positive().optional(),
    openingValueMinor: SignedMinorSchema
  })
  .refine((value) => value.kind === "fixed_deposit" || value.maturityAt === undefined, {
    message: "maturityAt only applies to fixed deposits.",
    path: ["maturityAt"]
  })
  .refine((value) => value.kind === "fixed_deposit" || value.annualRateBps === undefined, {
    message: "annualRateBps only applies to fixed deposits.",
    path: ["annualRateBps"]
  })
  .refine(
    (value) =>
      value.kind === "gold" || value.kind === "silver" || value.quantityMilliUnits === undefined,
    { message: "quantityMilliUnits only applies to gold or silver.", path: ["quantityMilliUnits"] }
  )
  .refine((value) => value.kind === "loan_liability" || value.openingValueMinor >= 0, {
    message: "Only a loan_liability may have a negative value.",
    path: ["openingValueMinor"]
  });

export const AssetSchema = z.object({
  id: AssetIdSchema,
  userId: z.string().min(1),
  kind: AssetKindSchema,
  name: z.string().trim().min(1).max(80),
  openedAt: z.coerce.date(),
  maturityAt: z.coerce.date().optional(),
  annualRateBps: z.number().int().min(0).max(100_00).optional(),
  quantityMilliUnits: z.number().int().positive().optional(),
  isClosed: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date()
});

export const ValuationSourceSchema = z.enum(["manual", "maturity_projection"]);

export const CreateValuationSchema = z.object({
  valueMinor: SignedMinorSchema,
  valuedAt: z.coerce.date(),
  source: ValuationSourceSchema.default("manual")
});

export const ValuationSchema = CreateValuationSchema.extend({
  id: z.string().uuid("Valuation id must be a UUID."),
  assetId: AssetIdSchema,
  userId: z.string().min(1),
  createdAt: z.coerce.date()
});

export const ValuationPageSchema = z.object({
  items: z.array(ValuationSchema),
  pageInfo: PageInfoSchema
});

export const NetWorthAccountSchema = z.object({
  accountId: AccountIdSchema,
  name: z.string(),
  balanceMinor: SignedMinorSchema
});

export const NetWorthAssetSchema = z.object({
  assetId: AssetIdSchema,
  name: z.string(),
  kind: AssetKindSchema,
  valueMinor: SignedMinorSchema,
  valuedAt: z.coerce.date().nullable()
});

export const NetWorthSchema = z.object({
  asOf: z.coerce.date(),
  netWorthMinor: SignedMinorSchema,
  accounts: z.array(NetWorthAccountSchema),
  assets: z.array(NetWorthAssetSchema)
});

export type AssetKind = z.infer<typeof AssetKindSchema>;
export type AssetId = z.infer<typeof AssetIdSchema>;
export type CreateAsset = z.infer<typeof CreateAssetSchema>;
export type Asset = z.infer<typeof AssetSchema>;
export type ValuationSource = z.infer<typeof ValuationSourceSchema>;
export type CreateValuation = z.infer<typeof CreateValuationSchema>;
export type Valuation = z.infer<typeof ValuationSchema>;
export type ValuationPage = z.infer<typeof ValuationPageSchema>;
export type NetWorth = z.infer<typeof NetWorthSchema>;
