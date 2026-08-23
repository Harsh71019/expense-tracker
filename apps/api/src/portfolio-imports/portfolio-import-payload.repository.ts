import { Inject, Injectable } from "@nestjs/common";
import type { PortfolioImportBatchId } from "@treasury-ops/shared";
import { and, eq, lte } from "drizzle-orm";

import { DATABASE_CONNECTION, type DrizzleDb } from "../common/db/db.module.js";
import type { DbTx } from "../common/db/db-txn.js";
import { portfolioImportPayloads } from "../common/db/schema/index.js";
import type { SealedPortfolioImportMaterial } from "./portfolio-import-encryption.service.js";

export type CreatePortfolioImportPayloadInput = Readonly<{
  batchId: PortfolioImportBatchId;
  sealedFile: SealedPortfolioImportMaterial;
  sealedPassword?: SealedPortfolioImportMaterial | undefined;
  expiresAt: Date;
}>;

export type StoredPortfolioImportPayload = Readonly<{
  batchId: PortfolioImportBatchId;
  userId: string;
  sealedFile: SealedPortfolioImportMaterial;
  sealedPassword?: SealedPortfolioImportMaterial | undefined;
  expiresAt: Date;
  createdAt: Date;
}>;

@Injectable()
export class PortfolioImportPayloadRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async create(userId: string, input: CreatePortfolioImportPayloadInput, tx: DbTx): Promise<void> {
    await tx.insert(portfolioImportPayloads).values({
      batchId: input.batchId,
      userId,
      encryptedFile: input.sealedFile.ciphertext,
      fileNonce: input.sealedFile.nonce,
      fileAuthTag: input.sealedFile.authTag,
      encryptedPassword: input.sealedPassword?.ciphertext ?? null,
      passwordNonce: input.sealedPassword?.nonce ?? null,
      passwordAuthTag: input.sealedPassword?.authTag ?? null,
      keyVersion: input.sealedFile.keyVersion,
      expiresAt: input.expiresAt,
      createdAt: new Date()
    });
  }

  async findByBatchId(
    userId: string,
    batchId: PortfolioImportBatchId,
    tx?: DbTx
  ): Promise<StoredPortfolioImportPayload | null> {
    const executor = tx ?? this.db;
    const [row] = await executor
      .select()
      .from(portfolioImportPayloads)
      .where(
        and(
          eq(portfolioImportPayloads.userId, userId),
          eq(portfolioImportPayloads.batchId, batchId)
        )
      );
    if (row === undefined) return null;

    return {
      batchId: row.batchId,
      userId: row.userId,
      sealedFile: {
        ciphertext: row.encryptedFile,
        nonce: row.fileNonce,
        authTag: row.fileAuthTag,
        keyVersion: row.keyVersion
      },
      ...(row.encryptedPassword !== null &&
      row.passwordNonce !== null &&
      row.passwordAuthTag !== null
        ? {
            sealedPassword: {
              ciphertext: row.encryptedPassword,
              nonce: row.passwordNonce,
              authTag: row.passwordAuthTag,
              keyVersion: row.keyVersion
            }
          }
        : {}),
      expiresAt: row.expiresAt,
      createdAt: row.createdAt
    };
  }

  async deleteByBatchId(
    userId: string,
    batchId: PortfolioImportBatchId,
    tx?: DbTx
  ): Promise<boolean> {
    const executor = tx ?? this.db;
    const rows = await executor
      .delete(portfolioImportPayloads)
      .where(
        and(
          eq(portfolioImportPayloads.userId, userId),
          eq(portfolioImportPayloads.batchId, batchId)
        )
      )
      .returning({ batchId: portfolioImportPayloads.batchId });
    return rows.length === 1;
  }

  /**
   * Worker-only sweeper deletion of expired temporary payloads.
   */
  async systemDeleteExpired(now: Date, limit: number, tx: DbTx): Promise<number> {
    const expired = await tx
      .select({ batchId: portfolioImportPayloads.batchId })
      .from(portfolioImportPayloads)
      .where(lte(portfolioImportPayloads.expiresAt, now))
      .limit(limit);

    if (expired.length === 0) return 0;

    let deleted = 0;
    for (const item of expired) {
      await tx
        .delete(portfolioImportPayloads)
        .where(eq(portfolioImportPayloads.batchId, item.batchId));
      deleted += 1;
    }
    return deleted;
  }
}
