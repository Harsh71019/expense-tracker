import { StagedRowPageSchema, type StagedRowPage } from "@vyaya/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";
import { debug } from "@/lib/debug";

function emptyPage(): StagedRowPage {
  return { items: [], pageInfo: { nextCursor: null, hasMore: false, limit: 50 } };
}

export const getStagedRows = cache(async (batchId: string): Promise<StagedRowPage> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/imports/{importBatchId}/preview", {
      params: { path: { importBatchId: batchId }, query: { limit: 50 } }
    });
    const parsed = StagedRowPageSchema.safeParse(result.data);
    if (!parsed.success) {
      debug.api("import preview response failed validation", parsed.error.flatten());
      return emptyPage();
    }
    return parsed.data;
  } catch (error: unknown) {
    debug.api("import preview request failed", error);
    return emptyPage();
  }
});
