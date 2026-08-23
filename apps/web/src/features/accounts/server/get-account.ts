import { AccountSchema, type Account } from "@treasury-ops/shared";
import { cache } from "react";

import { debug } from "@/lib/debug";
import { getServerApiClient } from "@/lib/api/server";

export const getAccount = cache(async (accountId: string): Promise<Account | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/accounts/{accountId}", {
      params: { path: { accountId } }
    });
    const parsed = AccountSchema.safeParse(result.data);
    if (!parsed.success) {
      debug.api("account response failed validation", parsed.error.flatten());
      return null;
    }
    return parsed.data;
  } catch (error: unknown) {
    debug.api("account request failed", error);
    return null;
  }
});
