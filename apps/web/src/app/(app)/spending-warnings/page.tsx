import type { ReactNode } from "react";

import {
  getSpendingWarnings,
  parseSpendingWarningFilters,
  SpendingWarningsPage,
  type SpendingWarningSearchParams
} from "@/features/spending-warnings";

export default async function SpendingWarningsRoute({
  searchParams
}: Readonly<{ searchParams: Promise<SpendingWarningSearchParams> }>): Promise<ReactNode> {
  const filters = parseSpendingWarningFilters(await searchParams);
  const initialPage = await getSpendingWarnings(filters);
  return <SpendingWarningsPage filters={filters} initialPage={initialPage} />;
}
