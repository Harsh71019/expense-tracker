import type { ReactNode } from "react";

import { ApiKeyManager, getApiKeys } from "@/features/api-keys";

export default async function ApiKeysPage(): Promise<ReactNode> {
  return <ApiKeyManager initialApiKeys={await getApiKeys()} />;
}
