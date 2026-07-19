import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ GET: vi.fn(), getServerApiClient: vi.fn() }));
vi.mock("@/lib/api/server", () => ({ getServerApiClient: mocks.getServerApiClient }));

const timestamp = "2026-07-16T00:00:00.000Z";
const account = {
  id: "3fa85f64-5717-4562-b3fc-2c963f66beef",
  userId: "user-1",
  name: "Cash",
  type: "cash",
  openingBalanceMinor: 0,
  balanceMinor: 0,
  currency: "INR",
  isArchived: false,
  createdAt: timestamp,
  updatedAt: timestamp
};

describe("getAccounts", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.GET.mockReset();
    mocks.getServerApiClient.mockReset();
    mocks.getServerApiClient.mockResolvedValue({ GET: mocks.GET });
  });

  it("parses accounts returned by the API", async () => {
    mocks.GET.mockResolvedValue({ data: [account] });
    const { getAccounts } = await import("./get-accounts");

    await expect(getAccounts()).resolves.toMatchObject([{ name: "Cash" }]);
  });

  it("fails closed for invalid and unavailable responses", async () => {
    mocks.GET.mockResolvedValue({ data: [{ id: "invalid" }] });
    const { getAccounts } = await import("./get-accounts");
    await expect(getAccounts()).resolves.toEqual([]);
  });
});
