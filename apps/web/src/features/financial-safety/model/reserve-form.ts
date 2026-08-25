import {
  UpdateReserveSourceSchema,
  type ReserveLiquidityTier,
  type ReserveSource,
  type UpdateReserveSource
} from "@treasury-ops/shared";

/**
 * @file Pure form transforms for classifying a reserve source. Money uses
 * `parseMinor()`/`formatMinor()` from shared only -- nothing here divides by
 * 100 inline. `eligibleCapMinor` of `0` is the form's "no cap" sentinel,
 * matching the convention used elsewhere in the app (see declared-debt's
 * minimum-payment field): the API never receives a literal zero cap.
 */

export type FieldErrors = Readonly<Record<string, string>>;

export type ParseResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; errors: FieldErrors; firstFieldId: string }>;

export type ReserveSourceFormValues = Readonly<{
  liquidityTier: ReserveLiquidityTier;
  isIncluded: boolean;
  eligibleCapMinor: number;
}>;

export const LIQUIDITY_TIER_OPTIONS: readonly Readonly<{
  value: ReserveLiquidityTier;
  label: string;
}>[] = [
  { value: "instant", label: "Instant access" },
  { value: "t_plus_1", label: "T+1 access" },
  { value: "locked", label: "Locked / excluded" }
];

export function initialReserveSourceFormValues(source: ReserveSource): ReserveSourceFormValues {
  const configuration = source.configuration;
  if (configuration === null) {
    return { liquidityTier: "instant", isIncluded: true, eligibleCapMinor: 0 };
  }
  return {
    liquidityTier: configuration.liquidityTier,
    isIncluded: configuration.isIncluded,
    eligibleCapMinor: configuration.eligibleCapMinor ?? 0
  };
}

export function parseReserveSourceForm(
  values: ReserveSourceFormValues
): ParseResult<UpdateReserveSource> {
  const parsed = UpdateReserveSourceSchema.safeParse({
    liquidityTier: values.liquidityTier,
    isIncluded: values.isIncluded,
    ...(values.eligibleCapMinor > 0 ? { eligibleCapMinor: values.eligibleCapMinor } : {})
  });

  if (parsed.success) return { ok: true, value: parsed.data };

  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const fieldId = FIELD_IDS[String(issue.path[0])] ?? "reserve-source-tier";
    errors[fieldId] ??= issue.message;
  }
  return { ok: false, errors, firstFieldId: firstFieldId(errors) };
}

const FIELD_IDS: Readonly<Record<string, string>> = {
  liquidityTier: "reserve-source-tier",
  isIncluded: "reserve-source-included",
  eligibleCapMinor: "reserve-source-cap"
};

const FIELD_ORDER = [
  "reserve-source-tier",
  "reserve-source-included",
  "reserve-source-cap"
] as const;

function firstFieldId(errors: Readonly<Record<string, string>>): string {
  return FIELD_ORDER.find((fieldId) => errors[fieldId] !== undefined) ?? FIELD_ORDER[0];
}

/**
 * A pre-save preview of the V1 eligible-amount formula
 * (`min(max(currentValueMinor, 0), cap ?? currentValueMinor)`) so the form
 * can show what a cap would do to the current value. This is deliberately
 * NOT the canonical eligible amount: it does not apply freshness, inclusion,
 * archival/closure, or structural-type exclusions -- only the backend's
 * evaluated `ReserveSource.eligibleMinor` (shown after saving) is
 * authoritative. `capMinor` of `0` means "no cap".
 */
export function previewEligibleMinor(
  currentValueMinor: number | null,
  capMinor: number
): number | null {
  if (currentValueMinor === null) return null;
  const nonNegative = Math.max(currentValueMinor, 0);
  return capMinor > 0 ? Math.min(nonNegative, capMinor) : nonNegative;
}
