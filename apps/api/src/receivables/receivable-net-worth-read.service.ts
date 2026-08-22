import { Injectable } from "@nestjs/common";
import type { NetWorthReceivable } from "@treasury-ops/shared";

import { ReceivableRepository } from "./receivable.repository.js";

/** Narrow, tenant-scoped read side consumed only by NetWorthModule (plan doc
 * §5: `NetWorthModule -> ... + ReceivablesModule`) -- keeps NetWorth from
 * depending on the full receivables write surface. */
@Injectable()
export class ReceivableNetWorthReadService {
  constructor(private readonly receivables: ReceivableRepository) {}

  async listActive(userId: string): Promise<NetWorthReceivable[]> {
    const asOf = new Date();
    const rows = await this.receivables.listActiveForNetWorth(userId);
    return rows.map((row) => ({
      receivableId: row.receivableId,
      counterpartyName: row.counterpartyName,
      outstandingMinor: row.outstandingMinor,
      asOf
    }));
  }
}
