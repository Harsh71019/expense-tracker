import {
  calendarDayDistance,
  type BillStatementRowMatchStatus,
  type ParsedRow,
  type StatementAssignmentEvidence,
  type StatementAssignmentSuggestion,
  type Transaction,
  type TransactionId
} from "@treasury-ops/shared";

import { jaccardSimilarityBps } from "../common/transaction-text/similarity.js";
import { normalizeTransactionText } from "../common/transaction-text/normalize-transaction-text.js";

export const STATEMENT_ASSIGNMENT_ALGORITHM_VERSION = 1;
export const STATEMENT_ASSIGNMENT_DATE_WINDOW_DAYS = 1;
export const STATEMENT_ASSIGNMENT_MAX_ROWS = 50;

const DATE_WEIGHT = 10_000;
const TEXT_WEIGHT = 1;
const SOURCE_PENALTY = 0;
const UNMATCHED_COST = 15_000;
const MIN_ASSIGNMENT_MARGIN_COST = 500;
const PROHIBITED_COST = 1_000_000_000;
const DEFAULT_INPUT_WATERMARK = "0".repeat(64);

export type StatementRowCandidate = Readonly<{
  rowNumber: number;
  parsed?: ParsedRow;
}>;

export type StatementRowMatch = Readonly<{
  rowNumber: number;
  matchStatus: BillStatementRowMatchStatus;
  matchedTransactionId?: TransactionId;
  matchSuggestion?: StatementAssignmentSuggestion;
}>;

type CandidateEdge = Readonly<{
  transactionIndex: number;
  transactionId: TransactionId;
  dateDistanceDays: number;
  descriptionSimilarityBps: number;
  dateCost: number;
  textCost: number;
  sourcePenalty: number;
  cost: number;
}>;

type AssignmentSolution = Readonly<{
  columnsByRow: readonly number[];
  totalCost: number;
}>;

type BlockedEdge = Readonly<{
  rowIndex: number;
  transactionIndex: number;
}>;

/**
 * Bounded, review-only minimum-cost assignment. Candidate eligibility is
 * always constrained by type, exact integer amount, and the date window;
 * narration similarity only breaks ties inside that strict block.
 */
export function matchStatementRows(
  rows: readonly StatementRowCandidate[],
  transactions: readonly Transaction[],
  inputWatermark: string = DEFAULT_INPUT_WATERMARK,
  resourceLimitHit: boolean = false
): StatementRowMatch[] {
  const sortedTransactions = [...transactions].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  const parsedRows = rows.filter(
    (row): row is StatementRowCandidate & Readonly<{ parsed: ParsedRow }> =>
      row.parsed !== undefined
  );
  if (resourceLimitHit || parsedRows.length > STATEMENT_ASSIGNMENT_MAX_ROWS) {
    return rows.map((row) => resourceLimitedMatch(row, inputWatermark));
  }

  const edgesByParsedRow = parsedRows.map((row) => candidateEdges(row.parsed, sortedTransactions));
  const solution = solveAssignment(parsedRows.length, sortedTransactions.length, edgesByParsedRow);
  const matchesByRowNumber = new Map<number, StatementRowMatch>();

  for (let parsedIndex = 0; parsedIndex < parsedRows.length; parsedIndex += 1) {
    const row = parsedRows[parsedIndex];
    const edgeCandidates = edgesByParsedRow[parsedIndex];
    const assignedColumn = solution.columnsByRow[parsedIndex];
    if (row === undefined || edgeCandidates === undefined || assignedColumn === undefined) {
      throw new Error("Statement assignment omitted a parsed row.");
    }
    const selected = edgeCandidates.find((edge) => edge.transactionIndex === assignedColumn);
    matchesByRowNumber.set(
      row.rowNumber,
      matchForAssignment(
        parsedIndex,
        row.rowNumber,
        edgeCandidates,
        selected,
        solution,
        parsedRows.length,
        sortedTransactions.length,
        edgesByParsedRow,
        inputWatermark
      )
    );
  }

  return rows.map((row) => {
    const match = matchesByRowNumber.get(row.rowNumber);
    return match ?? { rowNumber: row.rowNumber, matchStatus: "missing_from_ledger" };
  });
}

function candidateEdges(parsed: ParsedRow, transactions: readonly Transaction[]): CandidateEdge[] {
  const statementText = normalizeTransactionText(parsed.description);
  return transactions.flatMap((transaction, transactionIndex) => {
    const dateDistanceDays = calendarDayDistance(transaction.occurredAt, parsed.occurredAt);
    if (
      transaction.type !== parsed.type ||
      transaction.amountMinor !== parsed.amountMinor ||
      dateDistanceDays > STATEMENT_ASSIGNMENT_DATE_WINDOW_DAYS
    ) {
      return [];
    }
    const transactionText = normalizeTransactionText(transaction.description);
    const descriptionSimilarityBps = descriptionSimilarity(
      statementText.tokens,
      transactionText.tokens
    );
    const dateCost = dateDistanceDays * DATE_WEIGHT;
    const textCost = (10_000 - descriptionSimilarityBps) * TEXT_WEIGHT;
    return [
      {
        transactionIndex,
        transactionId: transaction.id,
        dateDistanceDays,
        descriptionSimilarityBps,
        dateCost,
        textCost,
        sourcePenalty: SOURCE_PENALTY,
        cost: dateCost + textCost + SOURCE_PENALTY
      }
    ];
  });
}

function descriptionSimilarity(
  leftTokens: readonly string[],
  rightTokens: readonly string[]
): number {
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  return jaccardSimilarityBps(leftTokens, rightTokens);
}

function matchForAssignment(
  rowIndex: number,
  rowNumber: number,
  candidates: readonly CandidateEdge[],
  selected: CandidateEdge | undefined,
  solution: AssignmentSolution,
  rowCount: number,
  transactionCount: number,
  edgesByRow: readonly (readonly CandidateEdge[])[],
  inputWatermark: string
): StatementRowMatch {
  if (selected === undefined) {
    const hasCompetingCandidate = candidates.some((candidate) => candidate.cost < UNMATCHED_COST);
    return {
      rowNumber,
      matchStatus: hasCompetingCandidate ? "ambiguous" : "missing_from_ledger",
      matchSuggestion: suggestion(
        0,
        evidence(candidates.length, null, null, null),
        {
          status: "insufficient",
          reason: hasCompetingCandidate ? "ambiguous_assignment" : "no_eligible_candidate",
          candidateCount: candidates.length
        },
        inputWatermark
      )
    };
  }

  const alternative = solveAssignment(rowCount, transactionCount, edgesByRow, {
    rowIndex,
    transactionIndex: selected.transactionIndex
  });
  const assignmentMarginCost = alternative.totalCost - solution.totalCost;
  const assignmentEvidence = evidence(
    candidates.length,
    selected,
    alternative.totalCost,
    assignmentMarginCost
  );
  const accepted =
    selected.cost < UNMATCHED_COST && assignmentMarginCost >= MIN_ASSIGNMENT_MARGIN_COST;
  if (!accepted) {
    const reason =
      selected.cost < UNMATCHED_COST ? "ambiguous_assignment" : "no_eligible_candidate";
    return {
      rowNumber,
      matchStatus: selected.cost < UNMATCHED_COST ? "ambiguous" : "missing_from_ledger",
      matchSuggestion: suggestion(
        confidenceBps(selected.cost),
        assignmentEvidence,
        { status: "insufficient", reason, candidateCount: candidates.length },
        inputWatermark
      )
    };
  }

  return {
    rowNumber,
    matchStatus: "matched",
    matchedTransactionId: selected.transactionId,
    matchSuggestion: suggestion(
      confidenceBps(selected.cost),
      assignmentEvidence,
      { status: "sufficient", candidateCount: candidates.length },
      inputWatermark
    )
  };
}

function resourceLimitedMatch(
  row: StatementRowCandidate,
  inputWatermark: string
): StatementRowMatch {
  if (row.parsed === undefined) {
    return { rowNumber: row.rowNumber, matchStatus: "missing_from_ledger" };
  }
  return {
    rowNumber: row.rowNumber,
    matchStatus: "ambiguous",
    matchSuggestion: suggestion(
      0,
      evidence(0, null, null, null),
      { status: "insufficient", reason: "resource_limit", candidateCount: 0 },
      inputWatermark
    )
  };
}

function evidence(
  candidateCount: number,
  selected: CandidateEdge | null,
  alternativeCost: number | null,
  assignmentMarginCost: number | null
): StatementAssignmentEvidence {
  return {
    candidateCount,
    selectedTransactionId: selected?.transactionId ?? null,
    dateDistanceDays: selected?.dateDistanceDays ?? null,
    descriptionSimilarityBps: selected?.descriptionSimilarityBps ?? null,
    dateCost: selected?.dateCost ?? null,
    textCost: selected?.textCost ?? null,
    sourcePenalty: selected?.sourcePenalty ?? SOURCE_PENALTY,
    assignedCost: selected?.cost ?? null,
    unmatchedCost: UNMATCHED_COST,
    alternativeCost,
    assignmentMarginCost
  };
}

function suggestion(
  confidenceBps: number,
  assignmentEvidence: StatementAssignmentEvidence,
  sufficiency: StatementAssignmentSuggestion["sufficiency"],
  inputWatermark: string
): StatementAssignmentSuggestion {
  return {
    confidenceBps,
    method: "global_assignment_v1",
    evidence: assignmentEvidence,
    sufficiency,
    algorithmVersion: STATEMENT_ASSIGNMENT_ALGORITHM_VERSION,
    inputWatermark
  };
}

function confidenceBps(cost: number): number {
  if (cost >= UNMATCHED_COST) return 0;
  const numerator = BigInt(UNMATCHED_COST - cost) * 10_000n;
  const denominator = BigInt(UNMATCHED_COST);
  return Number((numerator + denominator / 2n) / denominator);
}

function solveAssignment(
  rowCount: number,
  transactionCount: number,
  edgesByRow: readonly (readonly CandidateEdge[])[],
  blocked?: BlockedEdge
): AssignmentSolution {
  if (rowCount === 0) return { columnsByRow: [], totalCost: 0 };
  const columnCount = transactionCount + rowCount;
  const costs = Array.from({ length: rowCount }, (_, rowIndex) => {
    const rowCosts = new Array<number>(columnCount).fill(PROHIBITED_COST);
    const edges = edgesByRow[rowIndex] ?? [];
    for (const edge of edges) {
      const isBlocked =
        blocked !== undefined &&
        blocked.rowIndex === rowIndex &&
        blocked.transactionIndex === edge.transactionIndex;
      rowCosts[edge.transactionIndex] = isBlocked ? PROHIBITED_COST : edge.cost;
    }
    rowCosts[transactionCount + rowIndex] = UNMATCHED_COST;
    return rowCosts;
  });
  return hungarian(costs);
}

/** A deterministic rectangular Hungarian solver for at most 50 statement rows. */
function hungarian(costs: readonly (readonly number[])[]): AssignmentSolution {
  const rowCount = costs.length;
  const firstRow = costs[0];
  if (rowCount === 0 || firstRow === undefined) return { columnsByRow: [], totalCost: 0 };
  const columnCount = firstRow.length;
  if (columnCount < rowCount)
    throw new RangeError("Assignment requires at least one column per row.");

  const potentialsByRow = new Array<number>(rowCount + 1).fill(0);
  const potentialsByColumn = new Array<number>(columnCount + 1).fill(0);
  const matchedRowByColumn = new Array<number>(columnCount + 1).fill(0);
  const predecessorByColumn = new Array<number>(columnCount + 1).fill(0);

  for (let row = 1; row <= rowCount; row += 1) {
    matchedRowByColumn[0] = row;
    let column = 0;
    const minimum = new Array<number>(columnCount + 1).fill(PROHIBITED_COST);
    const used = new Array<boolean>(columnCount + 1).fill(false);
    do {
      used[column] = true;
      const matchedRow = matchedRowByColumn[column];
      if (matchedRow === undefined || matchedRow === 0)
        throw new Error("Invalid assignment state.");
      const costsForRow = costs[matchedRow - 1];
      if (costsForRow === undefined) throw new Error("Assignment cost row is missing.");
      let delta = PROHIBITED_COST;
      let nextColumn = 0;
      for (let candidateColumn = 1; candidateColumn <= columnCount; candidateColumn += 1) {
        if (used[candidateColumn] === true) continue;
        const cost = costsForRow[candidateColumn - 1];
        if (cost === undefined) throw new Error("Assignment cost is missing.");
        const current =
          cost - (potentialsByRow[matchedRow] ?? 0) - (potentialsByColumn[candidateColumn] ?? 0);
        if (current < (minimum[candidateColumn] ?? PROHIBITED_COST)) {
          minimum[candidateColumn] = current;
          predecessorByColumn[candidateColumn] = column;
        }
        if ((minimum[candidateColumn] ?? PROHIBITED_COST) < delta) {
          delta = minimum[candidateColumn] ?? PROHIBITED_COST;
          nextColumn = candidateColumn;
        }
      }
      for (let candidateColumn = 0; candidateColumn <= columnCount; candidateColumn += 1) {
        if (used[candidateColumn] === true) {
          const usedRow = matchedRowByColumn[candidateColumn] ?? 0;
          potentialsByRow[usedRow] = (potentialsByRow[usedRow] ?? 0) + delta;
          potentialsByColumn[candidateColumn] = (potentialsByColumn[candidateColumn] ?? 0) - delta;
        } else {
          minimum[candidateColumn] = (minimum[candidateColumn] ?? PROHIBITED_COST) - delta;
        }
      }
      column = nextColumn;
    } while ((matchedRowByColumn[column] ?? 0) !== 0);

    do {
      const previousColumn = predecessorByColumn[column];
      if (previousColumn === undefined) throw new Error("Assignment predecessor is missing.");
      matchedRowByColumn[column] = matchedRowByColumn[previousColumn] ?? 0;
      column = previousColumn;
    } while (column !== 0);
  }

  const columnsByRow = new Array<number>(rowCount).fill(-1);
  for (let column = 1; column <= columnCount; column += 1) {
    const row = matchedRowByColumn[column] ?? 0;
    if (row > 0) columnsByRow[row - 1] = column - 1;
  }
  let totalCost = 0;
  for (let row = 0; row < rowCount; row += 1) {
    const column = columnsByRow[row];
    const costsForRow = costs[row];
    const cost =
      column === undefined || costsForRow === undefined ? undefined : costsForRow[column];
    if (column === undefined || column < 0 || cost === undefined) {
      throw new Error("Assignment did not cover every row.");
    }
    totalCost += cost;
  }
  return { columnsByRow, totalCost };
}
