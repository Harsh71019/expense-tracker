import { cookies } from "next/headers";
import { cache } from "react";
import createClient from "openapi-fetch";

import { generateRequestId } from "../request-id";
import { getApiBaseUrl } from "./base-url";
import type { paths } from "./generated/schema";

export const getServerApiClient = cache(
  async (): Promise<ReturnType<typeof createClient<paths>>> => {
    const cookieStore = await cookies();
    return createClient<paths>({
      baseUrl: getApiBaseUrl(),
      headers: { cookie: cookieStore.toString(), "x-request-id": generateRequestId() }
    });
  }
);
