import { ColumnMappingSchema, type ColumnMapping } from "@treasury-ops/shared";
import type { HttpHandler } from "msw";

import { applyBalanceDelta, findAccount } from "../data/store";
import type {
  BillPaymentResultDto,
  BillStatementUploadDto,
  MockStore,
  TransactionDto
} from "../data/store";
import { mockProblem } from "../data/problem";
import type { MockHttp } from "./types";

function activeUpload(store: MockStore, billId: string): BillStatementUploadDto | undefined {
  return store.billStatementUploads.find((upload) => upload.billId === billId && upload.active);
}

function mappingDto(mapping: ColumnMapping): BillStatementUploadDto["mapping"] {
  return {
    date: mapping.date,
    description: mapping.description,
    dateFormat: mapping.dateFormat,
    amountConvention: mapping.amountConvention,
    ...(mapping.amount === undefined ? {} : { amount: mapping.amount }),
    ...(mapping.debit === undefined ? {} : { debit: mapping.debit }),
    ...(mapping.credit === undefined ? {} : { credit: mapping.credit })
  };
}

export function billHandlers(http: MockHttp, store: MockStore): HttpHandler[] {
  return [
    http.get("/v1/bills", ({ request, response }) => {
      const url = new URL(request.url);
      const accountId = url.searchParams.get("accountId");
      const reconciliationStatus = url.searchParams.get("reconciliationStatus");
      const paymentStatus = url.searchParams.get("paymentStatus");
      const requestedLimit = Number(url.searchParams.get("limit") ?? "50");
      const items = store.bills
        .filter((bill) => accountId === null || bill.accountId === accountId)
        .filter(
          (bill) =>
            reconciliationStatus === null || bill.reconciliationStatus === reconciliationStatus
        )
        .filter((bill) => paymentStatus === null || bill.paymentStatus === paymentStatus)
        .slice(0, requestedLimit);
      return response(200).json({
        items,
        pageInfo: { nextCursor: null, hasMore: false, limit: requestedLimit }
      });
    }),

    http.get("/v1/bills/{billId}", ({ params, response }) => {
      const bill = store.bills.find((candidate) => candidate.id === params.billId);
      const account = bill === undefined ? undefined : findAccount(store, bill.accountId);
      if (bill === undefined || account === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Bill not found."));
      }
      const upload = activeUpload(store, bill.id);
      return response(200).json({
        bill,
        account,
        ...(upload === undefined ? {} : { activeStatement: upload }),
        reconciliation: {
          stats: upload?.stats ?? {
            total: 0,
            matched: 0,
            missing: 0,
            ambiguous: 0,
            acknowledged: 0
          },
          unresolved:
            upload === undefined
              ? 0
              : Math.max(0, upload.stats.total - upload.stats.matched - upload.stats.acknowledged),
          canReconcile: upload?.status === "staged",
          extraTransactions: []
        }
      });
    }),

    http.post("/v1/bills/{billId}/statement", async ({ params, request, response }) => {
      const bill = store.bills.find((candidate) => candidate.id === params.billId);
      if (bill === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Bill not found."));
      }
      const key = request.headers.get("Idempotency-Key") ?? "";
      const replay = store.idempotency.billStatementUploads.get(key);
      if (replay !== undefined) {
        return response(200).json(replay, { headers: { "Idempotency-Replayed": "true" } });
      }
      const form = await request.formData();
      const file = form.get("file");
      const rawMapping = form.get("mapping");
      if (!(file instanceof File) || typeof rawMapping !== "string") {
        return response(422).json(
          mockProblem(422, "bill.invalid_statement_file", "Choose a CSV statement and mapping.")
        );
      }
      let parsedMapping: unknown;
      try {
        parsedMapping = JSON.parse(rawMapping);
      } catch {
        return response(422).json(
          mockProblem(422, "bill.invalid_statement_file", "Statement mapping is invalid.")
        );
      }
      const mapping = ColumnMappingSchema.safeParse(parsedMapping);
      if (!mapping.success) {
        return response(422).json(
          mockProblem(422, "bill.invalid_statement_file", "Statement mapping is invalid.")
        );
      }
      for (const upload of store.billStatementUploads) {
        if (upload.billId === bill.id) upload.active = false;
      }
      const now = new Date().toISOString();
      const upload: BillStatementUploadDto = {
        id: store.nextBillStatementUploadId(),
        userId: store.profile.userId,
        billId: bill.id,
        filename: file.name,
        fileHash: `${file.name}:${file.size}`,
        mapping: mappingDto(mapping.data),
        status: "staged",
        active: true,
        stats: { total: 0, matched: 0, missing: 0, ambiguous: 0, acknowledged: 0 },
        acknowledgedExtraTransactionIds: [],
        createdAt: now,
        updatedAt: now
      };
      store.billStatementUploads.push(upload);
      store.idempotency.billStatementUploads.set(key, upload);
      return response(201).json(upload);
    }),

    http.get("/v1/bills/{billId}/statement/rows", ({ params, response }) => {
      const upload = activeUpload(store, params.billId);
      if (upload === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Statement not found."));
      }
      const items = store.billStatementRows.filter((row) => row.uploadId === upload.id);
      return response(200).json({
        items,
        pageInfo: { nextCursor: null, hasMore: false, limit: 50 }
      });
    }),

    http.post("/v1/bills/{billId}/statement/reconcile", ({ params, request, response }) => {
      const bill = store.bills.find((candidate) => candidate.id === params.billId);
      const upload = activeUpload(store, params.billId);
      if (bill === undefined || upload === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Statement not found."));
      }
      const key = request.headers.get("Idempotency-Key") ?? "";
      const replay = store.idempotency.billReconcile.get(key);
      if (replay !== undefined) {
        return response(200).json(replay, { headers: { "Idempotency-Replayed": "true" } });
      }
      bill.reconciliationStatus = "reconciled";
      bill.updatedAt = new Date().toISOString();
      store.idempotency.billReconcile.set(key, bill);
      return response(200).json(bill);
    }),

    http.post("/v1/bills/{billId}/pay", async ({ params, request, response }) => {
      const bill = store.bills.find((candidate) => candidate.id === params.billId);
      if (bill === undefined) {
        return response(404).json(mockProblem(404, "common.not_found", "Bill not found."));
      }
      const key = request.headers.get("Idempotency-Key") ?? "";
      const replay = store.idempotency.billPayments.get(key);
      if (replay !== undefined) {
        return response(200).json(replay, { headers: { "Idempotency-Replayed": "true" } });
      }
      const body = await request.json();
      const source = body === undefined ? undefined : findAccount(store, body.fromAccountId);
      const card = findAccount(store, bill.accountId);
      if (body === undefined || source === undefined || card === undefined) {
        return response(404).json(
          mockProblem(404, "common.not_found", "Payment account not found.")
        );
      }
      if (bill.reconciliationStatus !== "reconciled") {
        return response(409).json(
          mockProblem(409, "bill.not_reconciled", "Reconcile the statement before payment.")
        );
      }
      if (body.amountMinor > bill.remainingMinor) {
        return response(409).json(
          mockProblem(409, "bill.overpayment", "Payment exceeds the remaining bill.")
        );
      }
      const now = new Date().toISOString();
      const transferGroupId = store.nextTransferGroupId();
      const common = {
        userId: store.profile.userId,
        amountMinor: body.amountMinor,
        occurredAt: body.occurredAt,
        description: "Credit card bill payment",
        tags: ["credit-card-bill"],
        currency: "INR" as const,
        source: "manual" as const,
        status: "posted" as const,
        paymentRail: "unknown" as const,
        counterpartyHandle: null,
        transferGroupId,
        createdAt: now,
        updatedAt: now
      };
      const fromTransaction: TransactionDto = {
        ...common,
        id: store.nextTransactionId(),
        accountId: source.id,
        type: "expense"
      };
      const toTransaction: TransactionDto = {
        ...common,
        id: store.nextTransactionId(),
        accountId: card.id,
        type: "income",
        billId: bill.id
      };
      store.transactions.push(fromTransaction, toTransaction);
      applyBalanceDelta(store, source.id, -body.amountMinor);
      applyBalanceDelta(store, card.id, body.amountMinor);
      bill.paidMinor += body.amountMinor;
      bill.remainingMinor = Math.max(0, bill.amountDueMinor - bill.paidMinor);
      bill.paymentStatus = bill.remainingMinor === 0 ? "paid" : "partial";
      bill.updatedAt = now;
      const result: BillPaymentResultDto = {
        bill,
        transfer: { transferGroupId, fromTransaction, toTransaction }
      };
      store.idempotency.billPayments.set(key, result);
      return response(200).json(result);
    })
  ];
}
