import { cache } from "react";
import { cookies } from "next/headers";
import { z } from "zod";

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

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/auth/get-session`, {
      headers: { cookie: cookieStore.toString() },
      cache: "no-store"
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const body: unknown = await response.json();
  const result = SessionResponseSchema.safeParse(body);
  return result.success ? result.data : null;
});
