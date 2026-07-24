export const SETTINGS_TABS = [
  {
    id: "profile",
    label: "Profile",
    description: "Identity and session",
    icon: "◉"
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme and accent",
    icon: "◐"
  },
  {
    id: "management",
    label: "Management",
    description: "Accounts and tools",
    icon: "⚙"
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
