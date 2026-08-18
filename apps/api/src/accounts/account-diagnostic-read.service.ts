import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { accounts } from "../common/db/schema/index.js";

export const AccountDiagnosticFactsSchema = z.object({
  activeCount: z.number().int().min(0),
  nonCreditCardCount: z.number().int().min(0),
  creditCardCount: z.number().int().min(0),
  creditCardOnly: z.boolean(),
  liquidCount: z.number().int().min(0),
  lastUpdatedAt: z.coerce.date().nullable()
});

export type AccountDiagnosticFacts = z.infer<typeof AccountDiagnosticFactsSchema>;

/**
 * Tenant-scoped narrow read port for account facts consumed by the financial
 * readiness diagnostic. Read-only by construction; returns parsed domain facts
 * rather than raw Drizzle rows.
 */
@Injectable()
export class AccountDiagnosticReadService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async getAccountDiagnosticFacts(userId: string): Promise<AccountDiagnosticFacts> {
    const rows = await this.db
      .select({
        id: accounts.id,
        type: accounts.type,
        updatedAt: accounts.updatedAt,
        createdAt: accounts.createdAt
      })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.isArchived, false)))
      .orderBy(desc(accounts.updatedAt));

    const activeCount = rows.length;
    let nonCreditCardCount = 0;
    let creditCardCount = 0;
    let liquidCount = 0;
    let latestTimestamp: Date | null = null;

    for (const row of rows) {
      if (row.type === "credit_card") {
        creditCardCount += 1;
      } else {
        nonCreditCardCount += 1;
      }

      if (row.type === "bank" || row.type === "cash" || row.type === "wallet") {
        liquidCount += 1;
      }

      const rowTs = row.updatedAt ?? row.createdAt;
      if (rowTs && (latestTimestamp === null || rowTs > latestTimestamp)) {
        latestTimestamp = rowTs;
      }
    }

    const creditCardOnly = activeCount > 0 && nonCreditCardCount === 0;

    return AccountDiagnosticFactsSchema.parse({
      activeCount,
      nonCreditCardCount,
      creditCardCount,
      creditCardOnly,
      liquidCount,
      lastUpdatedAt: latestTimestamp
    });
  }
}
