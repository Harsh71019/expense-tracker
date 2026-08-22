import { AccountInsightsQuerySchema, type AccountInsightsRange } from "@treasury-ops/shared";

export type AccountDetailSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

export function parseAccountInsightsRange(
  searchParams: AccountDetailSearchParams
): AccountInsightsRange {
  const rawRange = searchParams.range;
  const range = typeof rawRange === "string" ? rawRange : rawRange?.[0];
  const parsed = AccountInsightsQuerySchema.safeParse({ range });
  return parsed.success ? parsed.data.range : "30d";
}
