import type { ReactNode } from "react";

import { TransferList } from "@/features/transfers";
import { getTransferPage } from "@/features/transfers/server/get-transfer-page";

export default async function TransfersPage(): Promise<ReactNode> {
  const initialPage = await getTransferPage();
  return <TransferList initialPage={initialPage} />;
}
