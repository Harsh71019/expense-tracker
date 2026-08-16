export const SETTINGS_TABS = [
  { id: "profile", label: "Profile" },
  { id: "appearance", label: "Appearance" },
  { id: "income", label: "Income" },
  { id: "protection", label: "Protection & Debt" },
  { id: "api-keys", label: "API keys" }
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
