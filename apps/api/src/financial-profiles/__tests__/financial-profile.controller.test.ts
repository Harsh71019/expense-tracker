import type { SalaryVersion } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../../auth/auth.guard.js";
import { FinancialProfileNotConfiguredError } from "../../common/errors/financial-profile-not-configured.error.js";
import { focusedTestDouble } from "../../test/mock-drizzle.js";
import type { DebtProfileService } from "../debt-profile.service.js";
import { FinancialProfileController } from "../financial-profile.controller.js";
import type { FinancialProfileService } from "../financial-profile.service.js";
import type { ProtectionService } from "../protection.service.js";

const USER: AuthenticatedUser = { id: "user-1" };
const KEY = "11111111-1111-4111-8111-111111111111";
const VERSION: SalaryVersion = {
  id: "22222222-2222-4222-8222-222222222222",
  userId: "user-1",
  netMonthlySalaryMinor: 12_50_000,
  annualCtcMinor: null,
  effectiveFrom: new Date("2026-04-01T00:00:00.000Z"),
  source: "manually_confirmed",
  createdAt: new Date("2026-04-01T00:00:00.000Z")
};

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis()
  };
}

function createController(
  service: Partial<Record<keyof FinancialProfileService, unknown>>,
  protection: Partial<Record<keyof ProtectionService, unknown>> = {},
  debts: Partial<Record<keyof DebtProfileService, unknown>> = {}
) {
  return new FinancialProfileController(
    focusedTestDouble(service),
    focusedTestDouble(protection),
    focusedTestDouble(debts)
  );
}

describe("FinancialProfileController", () => {
  it("returns the setup state for the session user", async () => {
    const getState = vi.fn().mockResolvedValue({ configured: false });
    const controller = createController({ getState });

    expect(await controller.getState(USER)).toEqual({ configured: false });
    expect(getState).toHaveBeenCalledWith("user-1");
  });

  it("parses the profile body and requires a UUID idempotency key", async () => {
    const updateProfile = vi
      .fn()
      .mockResolvedValue({ result: { userId: "user-1" }, replayed: false });
    const controller = createController({ updateProfile });
    const response = createResponse();

    await controller.update(
      USER,
      { monthlyWorkMinutes: 9_600, incomeStability: "stable" },
      KEY,
      focusedTestDouble(response)
    );

    expect(updateProfile).toHaveBeenCalledWith(
      "user-1",
      {
        monthlyWorkMinutes: 9_600,
        incomeStability: "stable",
        salaryCreditDay: null,
        expectedAnnualIncrementBps: null
      },
      KEY
    );
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it("flags a replayed profile update", async () => {
    const updateProfile = vi
      .fn()
      .mockResolvedValue({ result: { userId: "user-1" }, replayed: true });
    const controller = createController({ updateProfile });
    const response = createResponse();

    await controller.update(
      USER,
      { monthlyWorkMinutes: 9_600, incomeStability: "stable" },
      KEY,
      focusedTestDouble(response)
    );

    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
  });

  it("rejects an invalid profile body before reaching the service", async () => {
    const updateProfile = vi.fn();
    const controller = createController({ updateProfile });

    await expect(
      controller.update(USER, { monthlyWorkMinutes: 0, incomeStability: "stable" }, KEY)
    ).rejects.toThrow();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("rejects a missing or non-UUID idempotency key on a mutation", async () => {
    const updateProfile = vi.fn();
    const controller = createController({ updateProfile });
    const body = { monthlyWorkMinutes: 9_600, incomeStability: "stable" };

    await expect(controller.update(USER, body)).rejects.toThrow();
    await expect(controller.update(USER, body, "not-a-uuid")).rejects.toThrow();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("parses history query defaults", async () => {
    const listSalaryVersions = vi.fn().mockResolvedValue({ items: [], pageInfo: {} });
    const controller = createController({ listSalaryVersions });

    await controller.listSalaryVersions(USER, {});
    expect(listSalaryVersions).toHaveBeenCalledWith("user-1", { limit: 50 });

    await controller.listSalaryVersions(USER, { limit: "10", cursor: "abc" });
    expect(listSalaryVersions).toHaveBeenLastCalledWith("user-1", { limit: 10, cursor: "abc" });
  });

  it("creates a salary version and downgrades a replay to 200", async () => {
    const addSalaryVersion = vi.fn().mockResolvedValue({ result: VERSION, replayed: true });
    const controller = createController({ addSalaryVersion });
    const response = createResponse();

    const created = await controller.createSalaryVersion(
      USER,
      { netMonthlySalaryMinor: 12_50_000, effectiveFrom: "2026-04-01T00:00:00.000Z" },
      KEY,
      focusedTestDouble(response)
    );

    expect(created).toEqual(VERSION);
    expect(addSalaryVersion).toHaveBeenCalledWith(
      "user-1",
      {
        netMonthlySalaryMinor: 12_50_000,
        annualCtcMinor: null,
        effectiveFrom: new Date("2026-04-01T00:00:00.000Z")
      },
      KEY
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
  });

  it("rejects a zero or negative salary before reaching the service", async () => {
    const addSalaryVersion = vi.fn();
    const controller = createController({ addSalaryVersion });

    await expect(
      controller.createSalaryVersion(
        USER,
        { netMonthlySalaryMinor: 0, effectiveFrom: "2026-04-01T00:00:00.000Z" },
        KEY
      )
    ).rejects.toThrow();
    expect(addSalaryVersion).not.toHaveBeenCalled();
  });

  it("passes an explicit asOf through and omits it otherwise", async () => {
    const getStatistics = vi.fn().mockResolvedValue({ formulaVersion: 1 });
    const controller = createController({ getStatistics });

    await controller.getStatistics(USER, {});
    expect(getStatistics).toHaveBeenCalledWith("user-1");

    await controller.getStatistics(USER, { asOf: "2026-05-01T00:00:00.000Z" });
    expect(getStatistics).toHaveBeenLastCalledWith("user-1", new Date("2026-05-01T00:00:00.000Z"));
  });

  it("propagates the not-configured problem for statistics before setup", async () => {
    const getStatistics = vi.fn().mockRejectedValue(new FinancialProfileNotConfiguredError());
    const controller = createController({ getStatistics });

    await expect(controller.getStatistics(USER, {})).rejects.toThrow(
      FinancialProfileNotConfiguredError
    );
  });

  it("reads protection state for the session user only", async () => {
    const getState = vi.fn().mockResolvedValue({ configured: false });
    const controller = createController({}, { getState });

    expect(await controller.getProtection(USER)).toEqual({ configured: false });
    expect(getState).toHaveBeenCalledWith("user-1");
  });

  it("parses the protection body, defaults absent cover to null, and downgrades a replay", async () => {
    const upsertProtection = vi.fn().mockResolvedValue({ result: { id: "s1" }, replayed: true });
    const controller = createController({}, { upsertProtection });
    const response = createResponse();

    await controller.putProtection(
      USER,
      {
        effectiveFrom: "2026-04-01T00:00:00.000Z",
        termCoverStatus: "employer_only",
        employerTermCoverMinor: 50_00_000,
        healthCoverStatus: "not_sure",
        dependantCount: 1
      },
      KEY,
      focusedTestDouble(response)
    );

    expect(upsertProtection).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        termCoverStatus: "employer_only",
        employerTermCoverMinor: 50_00_000,
        independentTermCoverMinor: null,
        termNotApplicableReason: null,
        healthCoverStatus: "not_sure",
        dependantCount: 1
      }),
      KEY
    );
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
  });

  it("rejects an invalid protection combination before reaching the service", async () => {
    const upsertProtection = vi.fn();
    const controller = createController({}, { upsertProtection });

    await expect(
      controller.putProtection(
        USER,
        {
          effectiveFrom: "2026-04-01T00:00:00.000Z",
          termCoverStatus: "none",
          independentTermCoverMinor: 10_00_000,
          healthCoverStatus: "none",
          dependantCount: 0
        },
        KEY
      )
    ).rejects.toThrow();
    expect(upsertProtection).not.toHaveBeenCalled();
  });

  it("requires a UUID idempotency key to save protection", async () => {
    const upsertProtection = vi.fn();
    const controller = createController({}, { upsertProtection });
    const body = {
      effectiveFrom: "2026-04-01T00:00:00.000Z",
      termCoverStatus: "none",
      healthCoverStatus: "none",
      dependantCount: 0
    };

    await expect(controller.putProtection(USER, body)).rejects.toThrow();
    await expect(controller.putProtection(USER, body, "not-a-uuid")).rejects.toThrow();
    expect(upsertProtection).not.toHaveBeenCalled();
  });

  it("defaults the debt list to active debts and passes the filter through", async () => {
    const list = vi.fn().mockResolvedValue({ items: [], pageInfo: {}, highCost: {} });
    const controller = createController({}, {}, { list });

    await controller.listDebts(USER, {});
    expect(list).toHaveBeenCalledWith("user-1", { limit: 50, status: "active" });

    await controller.listDebts(USER, { status: "resolved", limit: "10" });
    expect(list).toHaveBeenLastCalledWith("user-1", { limit: 10, status: "resolved" });
  });

  it("creates a declared debt and downgrades a replay to 200", async () => {
    const create = vi.fn().mockResolvedValue({ result: { id: "d1" }, replayed: true });
    const controller = createController({}, {}, { create });
    const response = createResponse();

    await controller.createDebt(
      USER,
      {
        name: "Amex revolve",
        kind: "credit_card",
        declaredOutstandingMinor: 85_000_00,
        annualRateBps: 4_200
      },
      KEY,
      focusedTestDouble(response)
    );

    expect(create).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ name: "Amex revolve", linkedAssetId: null }),
      KEY
    );
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it("rejects an unlinked debt with no outstanding amount before reaching the service", async () => {
    const create = vi.fn();
    const controller = createController({}, {}, { create });

    await expect(
      controller.createDebt(USER, { name: "Mystery", kind: "other", annualRateBps: 3_000 }, KEY)
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  it("resolves a debt through PATCH and flags a replay without downgrading the status", async () => {
    const update = vi.fn().mockResolvedValue({ result: { id: "d1" }, replayed: true });
    const controller = createController({}, {}, { update });
    const response = createResponse();
    const debtId = "33333333-3333-4333-8333-333333333333";

    await controller.updateDebt(
      USER,
      debtId,
      { status: "resolved" },
      KEY,
      focusedTestDouble(response)
    );

    expect(update).toHaveBeenCalledWith("user-1", debtId, { status: "resolved" }, KEY);
    expect(response.status).not.toHaveBeenCalled();
    expect(response.setHeader).toHaveBeenCalledWith("Idempotency-Replayed", "true");
  });

  it("rejects a non-UUID debt id and an unsupported status transition", async () => {
    const update = vi.fn();
    const controller = createController({}, {}, { update });
    const debtId = "33333333-3333-4333-8333-333333333333";

    await expect(controller.updateDebt(USER, "nope", { name: "x" }, KEY)).rejects.toThrow();
    await expect(controller.updateDebt(USER, debtId, { status: "active" }, KEY)).rejects.toThrow();
    await expect(controller.updateDebt(USER, debtId, {}, KEY)).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  });
});
