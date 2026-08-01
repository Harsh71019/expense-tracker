export type NavItem = Readonly<{ href: string; label: string; icon?: string }>;

export const mainNavItems: readonly NavItem[] = [
  { href: "/", label: "Dashboard", icon: "⌂" },
  { href: "/accounts", label: "Accounts", icon: "▣" },
  { href: "/insights", label: "Insights", icon: "✦" },
  { href: "/transactions", label: "Transactions", icon: "≡" },
  { href: "/recurring", label: "Recurring transactions", icon: "↻" },
  { href: "/transfers", label: "Transfers", icon: "⤢" },
  { href: "/categories", label: "Categories", icon: "▤" },
  { href: "/category-rules", label: "Category rules", icon: "⌁" },
  { href: "/imports", label: "Imports", icon: "↥" },
  { href: "/assets", label: "Assets", icon: "◈" },
  { href: "/goals", label: "Goals", icon: "◎" },
  { href: "/budgets", label: "Budgets", icon: "◫" },
  { href: "/reports", label: "Reports", icon: "◔" },
  { href: "/spending-warnings", label: "Patterns", icon: "△" },
  { href: "/settings", label: "Settings", icon: "⚙" }
] as const;
