import type { ReactNode } from "react";

import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ApiKeyManager, getApiKeys } from "@/features/api-keys";

export default async function ApiKeysPage(): Promise<ReactNode> {
  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Settings", href: "/settings" }, { label: "API keys" }]} />
      <ApiKeyManager initialApiKeys={await getApiKeys()} />
    </div>
  );
}
