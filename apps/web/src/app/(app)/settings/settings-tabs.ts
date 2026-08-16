export const SETTINGS_TABS = [
  {
    id: "profile",
    label: "Profile",
    description: "Operator identity & session security",
    iconName: "User"
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme & interface color studio",
    iconName: "Palette"
  },
  {
    id: "management",
    label: "Management",
    description: "12 ledger modules & pipelines",
    iconName: "LayoutGrid"
  },
  {
    id: "invariants",
    label: "Invariants",
    description: "Double-entry rules & zero-drift math",
    iconName: "ShieldCheck"
  }
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

export function settingsTabFromParam(value: string | readonly string[] | undefined): SettingsTab {
  if (typeof value !== "string") {
    return "profile";
  }

  const match = SETTINGS_TABS.find((tab) => tab.id === value);
  return match?.id ?? "profile";
}

export function settingsTabHref(tab: SettingsTab): string {
  return tab === "profile" ? "/settings" : `/settings?tab=${tab}`;
}
