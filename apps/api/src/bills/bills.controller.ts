import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  AccountIdSchema,
  AcknowledgeExtraTransactionSchema,
  BillStatementRowIdSchema,
  CreditCardBillIdSchema,
  CreditCardConfigInputSchema,
  ListBillsQuerySchema,
  ListBillStatementRowsQuerySchema,
  PayCreditCardBillSchema,
  UpdateBillStatementRowSchema,
  UploadBillStatementMetadataSchema,
  type Account,
  type BillPage,
  type BillPaymentResult,
  type BillStatementRow,
  type BillStatementRowPage,
  type BillStatementUpload,
  type CreditCardBill,
  type BillDetail
} from "@treasury-ops/shared";
import type { Response } from "express";
import { z } from "zod";

import type { AuthenticatedUser } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { InvalidBillStatementFileError } from "../common/errors/invalid-bill-statement-file.error.js";
import { BillReconciliationService } from "./bill-reconciliation.service.js";
import { BillsService } from "./bills.service.js";

const IdempotencyKeySchema = z.string().uuid();
const MultipartMetadataSchema = z.object({ mapping: z.string() });

type UploadedCsvFile = Readonly<{
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}>;

@Controller("v1/accounts")
export class CreditCardConfigController {
  constructor(private readonly bills: BillsService) {}

  @Patch(":accountId/credit-card-config")
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("accountId") accountId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<Account> {
    const result = await this.bills.updateCreditCardConfig(
      user.id,
      AccountIdSchema.parse(accountId),
      CreditCardConfigInputSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    setReplayHeader(response, result.replayed);
    return result.result;
  }
}

@Controller("v1/bills")
export class BillsController {
  constructor(
    private readonly bills: BillsService,
    private readonly reconciliation: BillReconciliationService
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: unknown): Promise<BillPage> {
    return this.bills.list(user.id, ListBillsQuerySchema.parse(query));
  }

  @Get(":billId")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("billId") billId: string
  ): Promise<BillDetail> {
    return this.bills.get(user.id, CreditCardBillIdSchema.parse(billId));
  }

  @Post(":billId/statement")
  @UseInterceptors(FileInterceptor("file"))
  async uploadStatement(
    @CurrentUser() user: AuthenticatedUser,
    @Param("billId") billId: string,
    @UploadedFile() file: UploadedCsvFile | undefined,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<BillStatementUpload> {
    if (file === undefined) {
      throw new InvalidBillStatementFileError('No file was uploaded under the "file" field.');
    }
    const metadata = UploadBillStatementMetadataSchema.parse(parseMultipartMetadata(body));
    const parsedBillId = CreditCardBillIdSchema.parse(billId);
    const result = await this.reconciliation.upload(
      user.id,
      parsedBillId,
      file.originalname,
      file.mimetype,
      file.buffer,
      metadata.mapping,
      IdempotencyKeySchema.parse(key)
    );
    setReplayHeader(response, result.replayed);
    response.setHeader("Location", `/api/v1/bills/${parsedBillId}`);
    return result.result;
  }

  @Get(":billId/statement/rows")
  rows(
    @CurrentUser() user: AuthenticatedUser,
    @Param("billId") billId: string,
    @Query() query: unknown
  ): Promise<BillStatementRowPage> {
    return this.reconciliation.listRows(
      user.id,
      CreditCardBillIdSchema.parse(billId),
      ListBillStatementRowsQuerySchema.parse(query)
    );
  }

  @Patch(":billId/statement/rows/:rowId")
  async updateRow(
    @CurrentUser() user: AuthenticatedUser,
    @Param("billId") billId: string,
    @Param("rowId") rowId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<BillStatementRow> {
    const result = await this.reconciliation.updateRow(
      user.id,
      CreditCardBillIdSchema.parse(billId),
      BillStatementRowIdSchema.parse(rowId),
      UpdateBillStatementRowSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    setReplayHeader(response, result.replayed);
    return result.result;
  }

  @Post(":billId/statement/acknowledge-extra")
  async acknowledgeExtra(
    @CurrentUser() user: AuthenticatedUser,
    @Param("billId") billId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<BillStatementUpload> {
    const input = AcknowledgeExtraTransactionSchema.parse(body);
    const result = await this.reconciliation.acknowledgeExtra(
      user.id,
      CreditCardBillIdSchema.parse(billId),
      input.transactionId,
      input.acknowledged,
      IdempotencyKeySchema.parse(key)
    );
    setReplayHeader(response, result.replayed);
    return result.result;
  }

  @Post(":billId/statement/reconcile")
  async reconcile(
    @CurrentUser() user: AuthenticatedUser,
    @Param("billId") billId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<CreditCardBill> {
    const result = await this.reconciliation.reconcile(
      user.id,
      CreditCardBillIdSchema.parse(billId),
      IdempotencyKeySchema.parse(key)
    );
    setReplayHeader(response, result.replayed);
    return result.result;
  }

  @Post(":billId/pay")
  async pay(
    @CurrentUser() user: AuthenticatedUser,
    @Param("billId") billId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<BillPaymentResult> {
    const result = await this.bills.pay(
      user.id,
      CreditCardBillIdSchema.parse(billId),
      PayCreditCardBillSchema.parse(body),
      IdempotencyKeySchema.parse(key)
    );
    setReplayHeader(response, result.replayed);
    return result.result;
  }
}

function parseMultipartMetadata(body: unknown): unknown {
  const { mapping } = MultipartMetadataSchema.parse(body);
  let parsed: unknown;
  try {
    parsed = JSON.parse(mapping);
  } catch {
    throw new InvalidBillStatementFileError('The "mapping" field must be valid JSON.');
  }
  return { mapping: parsed };
}

function setReplayHeader(response: Response, replayed: boolean): void {
  if (replayed) response.setHeader("Idempotency-Replayed", "true");
}
