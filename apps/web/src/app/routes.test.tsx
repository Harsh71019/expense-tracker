import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AddTransactionPage from "./(app)/add/page";
import DashboardPage from "./(app)/page";
import MorePage from "./(app)/more/page";
import ReportsPage from "./(app)/reports/page";
import TransactionsPage from "./(app)/transactions/page";
import AuthLayout from "./(auth)/layout";
import LoginPage from "./(auth)/login/page";
import NotFound from "./not-found";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "user-1", email: "harsh@example.com" } }
}));

vi.mock("@/lib/api/session", () => ({ getSession: async () => mocks.session }));
vi.mock("@/features/auth", () => ({
  LoginForm: () => <p>Mock login form</p>,
  SignOutButton: () => <button>Sign out</button>
}));

describe("route shells", () => {
  it("renders the dashboard and account page with the session email", async () => {
    render(await DashboardPage());
    expect(screen.getByRole("heading", { name: "harsh@example.com" })).toBeVisible();

    render(await MorePage());
    expect(screen.getByText("Signed in as")).toBeVisible();
    expect(screen.getAllByText("harsh@example.com")).toHaveLength(2);
  });

  it("renders each planned ledger route with its appropriate placeholder", () => {
    render(<AddTransactionPage />);
    expect(screen.getByRole("heading", { name: "Quick add" })).toBeVisible();

    render(<TransactionsPage />);
    expect(screen.getByRole("heading", { name: "Transactions" })).toBeVisible();

    render(<ReportsPage />);
    expect(screen.getByRole("heading", { name: "Reports" })).toBeVisible();
  });

  it("renders the auth, login, and not-found shells", () => {
    render(
      <AuthLayout>
        <p>Auth content</p>
      </AuthLayout>
    );
    expect(screen.getByText("Auth content")).toBeVisible();

    render(<LoginPage />);
    expect(screen.getByText("Mock login form")).toBeVisible();

    render(<NotFound />);
    expect(screen.getByRole("link", { name: "Back to Vyaya" })).toHaveAttribute("href", "/");
  });
});
