import { beforeEach, describe, expect, it, vi } from "vitest";

import { toast } from "./toast";

const sonner = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  loading: vi.fn(),
  promise: vi.fn(),
  dismiss: vi.fn()
}));

vi.mock("sonner", () => ({ toast: sonner }));

describe("application toast facade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sonner.success.mockReturnValue("success-id");
    sonner.info.mockReturnValue("info-id");
    sonner.warning.mockReturnValue("warning-id");
    sonner.error.mockReturnValue("error-id");
    sonner.loading.mockReturnValue("loading-id");
    sonner.dismiss.mockReturnValue("dismiss-id");
  });

  it("applies calm success and persistent error durations", () => {
    expect(toast.success("Saved")).toBe("success-id");
    expect(sonner.success).toHaveBeenCalledWith("Saved", { duration: 4_000 });

    expect(toast.error("Could not save", { id: "save-error" })).toBe("error-id");
    expect(sonner.error).toHaveBeenCalledWith("Could not save", {
      duration: 8_000,
      id: "save-error"
    });
  });

  it("preserves caller overrides and action options", () => {
    const onClick = vi.fn();
    toast.warning("Balance is low", {
      duration: 12_000,
      description: "Only ₹500 remains.",
      action: { label: "Review", onClick }
    });

    expect(sonner.warning).toHaveBeenCalledWith("Balance is low", {
      duration: 12_000,
      description: "Only ₹500 remains.",
      action: { label: "Review", onClick }
    });
  });

  it("delegates loading, promise, and dismissal lifecycles", () => {
    const task = Promise.resolve("done");
    toast.loading("Saving", { id: "save" });
    toast.promise(task, { loading: "Saving", success: "Saved", error: "Failed" });
    toast.dismiss("save");

    expect(sonner.loading).toHaveBeenCalledWith("Saving", { id: "save" });
    expect(sonner.promise).toHaveBeenCalledWith(task, {
      loading: "Saving",
      success: "Saved",
      error: "Failed"
    });
    expect(sonner.dismiss).toHaveBeenCalledWith("save");
  });
});
