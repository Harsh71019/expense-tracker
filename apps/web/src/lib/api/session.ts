import { cache } from "react";
import { cookies } from "next/headers";
import { z } from "zod";

import { debug } from "../debug";
import { generateRequestId } from "../request-id";
import { getApiBaseUrl } from "./base-url";

const SessionResponseSchema = z
  .object({
    user: z.object({
      id: z.string(),
      email: z.string()
    })
  })
  .nullable();

export type ServerSession = z.infer<typeof SessionResponseSchema>;

export const getSession = cache(async (): Promise<ServerSession> => {
  const cookieStore = await cookies();
  const reqId = generateRequestId();

  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/get-session`, {
      headers: { cookie: cookieStore.toString(), "x-request-id": reqId },
      credentials: "include",
      cache: "no-store"
    });
    debug.api(`get-session ${response.status} reqId=${reqId}`);

    if (!response.ok) {
      return null;
    }

    const body: unknown = await response.json();
    const result = SessionResponseSchema.safeParse(body);
    return result.success ? result.data : null;
  } catch (error) {
    debug.api(`get-session failed reqId=${reqId}`, error);
    return null;
  }
});
