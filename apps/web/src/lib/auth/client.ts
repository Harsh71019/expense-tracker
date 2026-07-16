import { createAuthClient } from "better-auth/react";

import { debug } from "../debug";
import { generateRequestId } from "../request-id";
import { getApiBaseUrl } from "../api/base-url";

export const authClient = createAuthClient({
  baseURL: `${getApiBaseUrl()}/auth`,
  fetchOptions: {
    onRequest(context) {
      const reqId = generateRequestId();
      context.headers.set("x-request-id", reqId);
      debug.api(`-> ${context.method} ${String(context.url)} reqId=${reqId}`);
    },
    onSuccess(context) {
      const reqId = context.request.headers.get("x-request-id") ?? "?";
      debug.api(`<- ${context.response.status} ${context.response.url} reqId=${reqId}`);
    },
    onError(context) {
      const reqId = context.request.headers.get("x-request-id") ?? "?";
      debug.api(`<- ${context.response.status} ${context.response.url} reqId=${reqId} (error)`);
    }
  }
});
