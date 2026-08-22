import {
  ReceivableEventPageSchema,
  ReceivablePageSchema,
  ReceivableSchema,
  ReceivableSummarySchema,
  type ListReceivablesQuery,
  type Receivable,
  type ReceivableEventPage,
  type ReceivablePage,
  type ReceivableSummary
} from "@treasury-ops/shared";
import { cache } from "react";

import { getServerApiClient } from "@/lib/api/server";

const EMPTY_PAGE_INFO = { nextCursor: null, hasMore: false, limit: 50 };
const EMPTY_PAGE: ReceivablePage = { items: [], pageInfo: EMPTY_PAGE_INFO };
const EMPTY_EVENT_PAGE: ReceivableEventPage = { items: [], pageInfo: EMPTY_PAGE_INFO };
const EMPTY_SUMMARY: ReceivableSummary = {
  totalOutstandingMinor: 0,
  totalConfirmedRepaidMinor: 0,
  activeCount: 0,
  dueCount: 0
};

export const getReceivables = cache(
  async (query: ListReceivablesQuery): Promise<ReceivablePage> => {
    try {
      const client = await getServerApiClient();
      const result = await client.GET("/v1/receivables", {
        params: {
          query: {
            status: query.status,
            limit: query.limit,
            ...(query.cursor === undefined ? {} : { cursor: query.cursor })
          }
        }
      });
      const parsed = ReceivablePageSchema.safeParse(result.data);
      return parsed.success ? parsed.data : EMPTY_PAGE;
    } catch {
      return EMPTY_PAGE;
    }
  }
);

export const getReceivableSummary = cache(async (): Promise<ReceivableSummary> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/receivables/summary");
    const parsed = ReceivableSummarySchema.safeParse(result.data);
    return parsed.success ? parsed.data : EMPTY_SUMMARY;
  } catch {
    return EMPTY_SUMMARY;
  }
});

export const getReceivable = cache(async (receivableId: string): Promise<Receivable | null> => {
  try {
    const client = await getServerApiClient();
    const result = await client.GET("/v1/receivables/{receivableId}", {
      params: { path: { receivableId } }
    });
    const parsed = ReceivableSchema.safeParse(result.data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
});

export const getReceivableEvents = cache(
  async (receivableId: string): Promise<ReceivableEventPage> => {
    try {
      const client = await getServerApiClient();
      const result = await client.GET("/v1/receivables/{receivableId}/events", {
        params: { path: { receivableId } }
      });
      const parsed = ReceivableEventPageSchema.safeParse(result.data);
      return parsed.success ? parsed.data : EMPTY_EVENT_PAGE;
    } catch {
      return EMPTY_EVENT_PAGE;
    }
  }
);
