import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserProfile } from "@treasury-ops/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ValidationError } from "@/lib/errors";

import { EditDisplayNameForm } from "./edit-display-name-form";

const mocks = vi.hoisted(
  (): {
    mutateAsync: ReturnType<typeof vi.fn>;
    pending: boolean;
    toastError: ReturnType<typeof vi.fn>;
    toastSuccess: ReturnType<typeof vi.fn>;
    profile: UserProfile | null;
  } => ({
    mutateAsync: vi.fn(),
    pending: false,
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    profile: null
  })
);

vi.mock("../hooks/use-profile", () => ({
  useProfile: () => ({ data: mocks.profile }),
  useUpdateProfile: () => ({ mutateAsync: mocks.mutateAsync, isPending: mocks.pending })
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess }
}));

const profile: UserProfile = {
  userId: "user-1",
  displayName: "Harsh",
  locale: "en-IN",
  timezone: "Asia/Kolkata",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("EditDisplayNameForm", () => {
  beforeEach(() => {
    mocks.pending = false;
    mocks.profile = profile;
    mocks.mutateAsync.mockReset();
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
  });

  it("renders nothing when the profile is unavailable", () => {
    mocks.profile = null;
    const { container } = render(<EditDisplayNameForm initialProfile={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("disables Save until the name changes from the current value", async () => {
    const user = userEvent.setup();
    render(<EditDisplayNameForm initialProfile={profile} />);

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "New Name");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("submits the new name and shows a success toast", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockResolvedValue({ ...profile, displayName: "New Name" });
    render(<EditDisplayNameForm initialProfile={profile} />);

    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "New Name");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith({ displayName: "New Name" });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Profile updated");
  });

  it("blocks submit and shows an inline error for an empty name, without calling the mutation", async () => {
    const user = userEvent.setup();
    render(<EditDisplayNameForm initialProfile={profile} />);

    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), " ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("shows a field error from a thrown ValidationError instead of a toast", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockRejectedValue(
      new ValidationError("Invalid", {}, [
        { path: "displayName", code: "too_long", message: "Too long" }
      ])
    );
    render(<EditDisplayNameForm initialProfile={profile} />);

    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "New Name");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Too long")).toBeInTheDocument();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("shows a toast for a non-validation failure", async () => {
    const user = userEvent.setup();
    mocks.mutateAsync.mockRejectedValue(new Error("network down"));
    render(<EditDisplayNameForm initialProfile={profile} />);

    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "New Name");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(mocks.toastError).toHaveBeenCalledWith("Could not update your profile.");
  });
});
