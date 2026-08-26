import { Inject, Injectable } from "@nestjs/common";
import { SafetyEvaluationSchema, type SafetyEvaluation } from "@treasury-ops/shared";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import type { DbTx } from "../common/db/db-txn.js";
import { DATABASE_CONNECTION } from "../common/db/db.module.js";
import type { DrizzleDb } from "../common/db/db.module.js";
import { financialSafetyEvaluations } from "../common/db/schema/index.js";

const StoredRowSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1),
  inputFingerprint: z.string().min(1),
  formulaVersion: z.number().int().min(1),
  policyVersion: z.number().int().min(1),
  asOf: z.coerce.date(),
  sourceThrough: z.coerce.date(),
  resultJson: z.unknown(),
  createdAt: z.coerce.date()
});

export type StoredSafetyEvaluation = Readonly<{
  id: string;
  createdAt: Date;
  evaluation: SafetyEvaluation;
}>;

function toStored(row: z.infer<typeof StoredRowSchema>): StoredSafetyEvaluation {
  return {
    id: row.id,
    createdAt: row.createdAt,
    // `resultJson` is `unknown` straight out of the database until this parse
    // -- the persisted row is evidence, never trusted as pre-validated shape.
    evaluation: SafetyEvaluationSchema.parse(row.resultJson)
  };
}

/**
 * The only layer that touches Drizzle for Safety Evaluation snapshots.
 * Every method takes `userId` first and filters by it. There is no update or
 * delete method: a row is immutable evidence, and a changed input produces a
 * new row via `insertIfAbsent`, never a mutation of an existing one.
 */
@Injectable()
export class SafetyEvaluationRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDb) {}

  async findByFingerprint(
    userId: string,
    inputFingerprint: string,
    formulaVersion: number,
    policyVersion: number
  ): Promise<StoredSafetyEvaluation | null> {
    const [row] = await this.db
      .select()
      .from(financialSafetyEvaluations)
      .where(
        and(
          eq(financialSafetyEvaluations.userId, userId),
          eq(financialSafetyEvaluations.inputFingerprint, inputFingerprint),
          eq(financialSafetyEvaluations.formulaVersion, formulaVersion),
          eq(financialSafetyEvaluations.policyVersion, policyVersion)
        )
      );
    return row === undefined ? null : toStored(StoredRowSchema.parse(row));
  }

  async findMostRecent(userId: string): Promise<StoredSafetyEvaluation | null> {
    const [row] = await this.db
      .select()
      .from(financialSafetyEvaluations)
      .where(eq(financialSafetyEvaluations.userId, userId))
      .orderBy(desc(financialSafetyEvaluations.createdAt))
      .limit(1);
    return row === undefined ? null : toStored(StoredRowSchema.parse(row));
  }

  /**
   * Inserts one immutable snapshot, or -- when a concurrent request already
   * won the identity race -- returns the row that already exists. The unique
   * index on (userId, inputFingerprint, formulaVersion, policyVersion) is
   * what makes five concurrent identical refreshes converge on one row.
   */
  async insertIfAbsent(
    userId: string,
    input: Readonly<{
      inputFingerprint: string;
      formulaVersion: number;
      policyVersion: number;
      asOf: Date;
      sourceThrough: Date;
      resultJson: SafetyEvaluation;
      createdAt: Date;
    }>,
    tx: DbTx
  ): Promise<StoredSafetyEvaluation> {
    const [inserted] = await tx
      .insert(financialSafetyEvaluations)
      .values({
        userId,
        inputFingerprint: input.inputFingerprint,
        formulaVersion: input.formulaVersion,
        policyVersion: input.policyVersion,
        asOf: input.asOf,
        sourceThrough: input.sourceThrough,
        resultJson: input.resultJson,
        createdAt: input.createdAt
      })
      .onConflictDoNothing({
        target: [
          financialSafetyEvaluations.userId,
          financialSafetyEvaluations.inputFingerprint,
          financialSafetyEvaluations.formulaVersion,
          financialSafetyEvaluations.policyVersion
        ]
      })
      .returning();

    if (inserted !== undefined) return toStored(StoredRowSchema.parse(inserted));

    const existing = await this.findByFingerprint(
      userId,
      input.inputFingerprint,
      input.formulaVersion,
      input.policyVersion
    );
    if (existing === null) {
      throw new Error("Safety evaluation insert conflicted but no existing row was found.");
    }
    return existing;
  }
}
