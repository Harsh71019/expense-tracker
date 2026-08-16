import type { SalaryVersion } from "@treasury-ops/shared";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "../../auth/auth.guard.js";
import { FinancialProfileNotConfiguredError } from "../../common/errors/financial-profile-not-configured.error.js";
import { focusedTestDouble } from "../../test/mock-drizzle.js";
import { FinancialProfileController } from "../financial-profile.controller.js";
import type { FinancialProfileService } from "../financial-profile.service.js";

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

function createController(service: Partial<Record<keyof FinancialProfileService, unknown>>) {
  return new FinancialProfileController(focusedTestDouble(service));
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
});
