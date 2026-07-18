"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";

export function QueryProvider({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, retry: 2, refetchOnWindowFocus: true },
          mutations: { retry: 0 }
        }
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
