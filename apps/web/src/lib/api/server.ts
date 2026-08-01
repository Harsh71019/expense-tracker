import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import createClient from "openapi-fetch";

import { generateRequestId } from "../request-id";
import { getApiBaseUrl } from "./base-url";
import type { paths } from "./generated/schema";
import { toNetworkError } from "./problem";

export function noStoreFetch(request: Request): Promise<Response> {
  return fetch(request, { cache: "no-store" });
}

export const getServerApiClient = cache(
  async (): Promise<ReturnType<typeof createClient<paths>>> => {
    const cookieStore = await cookies();
    const client = createClient<paths>({
      baseUrl: getApiBaseUrl(),
      headers: { cookie: cookieStore.toString(), "x-request-id": generateRequestId() },
      fetch: noStoreFetch
    });
    client.use({
      onError({ error }) {
        return toNetworkError(error);
      }
    });
    return client;
  }
);
