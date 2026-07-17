import { TransactionSchema, type Transaction } from "@vyaya/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

export const getTxn = cache(async (transactionId: string): Promise<Transaction | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/transactions/{transactionId}", {
      params: { path: { transactionId } }
    });
    const parsed = TransactionSchema.safeParse(result.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});
