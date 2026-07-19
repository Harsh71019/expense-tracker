"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";

import { makeQueryClient } from "./client";

export function QueryProvider({ children }: Readonly<{ children: ReactNode }>): ReactNode {
  const [client] = useState(makeQueryClient);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
