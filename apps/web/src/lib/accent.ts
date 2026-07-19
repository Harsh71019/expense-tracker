import type { NormalizedHex } from "./accent-color";
import { parseColorInput } from "./accent-color";

export const ACCENT_COOKIE_NAME = "vyaya-accent";
export const DEFAULT_ACCENT_COLOR: NormalizedHex = "#0f9d63";

export const ACCENT_PRESETS = {
  default: "default",
  ocean: "ocean",
  indigo: "indigo",
  violet: "violet",
  amber: "amber"
} as const;

export type AccentPreset = (typeof ACCENT_PRESETS)[keyof typeof ACCENT_PRESETS];

export type AccentPreference =
  | { kind: "default" }
  | { kind: "preset"; preset: Exclude<AccentPreset, "default"> }
  | { kind: "custom"; color: NormalizedHex };

export type AccentActionState =
  | { status: "idle"; message: "" }
  | { status: "error"; message: string }
  | { status: "success"; message: string };

export const INITIAL_ACCENT_ACTION_STATE: AccentActionState = { status: "idle", message: "" };

export function isAccentPreset(value: string | undefined): value is AccentPreset {
  return (
    value === ACCENT_PRESETS.default ||
    value === ACCENT_PRESETS.ocean ||
    value === ACCENT_PRESETS.indigo ||
    value === ACCENT_PRESETS.violet ||
    value === ACCENT_PRESETS.amber
  );
}

export function parseAccentCookie(value: string | undefined): AccentPreference {
  if (value === undefined) {
    return { kind: "default" };
  }

  if (value.startsWith("preset:")) {
    const preset = value.slice("preset:".length);
    if (isAccentPreset(preset) && preset !== ACCENT_PRESETS.default) {
      return { kind: "preset", preset };
    }
    return { kind: "default" };
  }

  const customMatch = /^custom:([0-9a-f]{6})$/.exec(value);
  const customDigits = customMatch?.[1];
  if (customDigits !== undefined) {
    const parsed = parseColorInput(`#${customDigits}`);
    return parsed.success ? { kind: "custom", color: parsed.color } : { kind: "default" };
  }

  return { kind: "default" };
}

export function serializeAccentPreference(preference: AccentPreference): string | null {
  if (preference.kind === "default") {
    return null;
  }
  if (preference.kind === "preset") {
    return `preset:${preference.preset}`;
  }
  return `custom:${preference.color.slice(1)}`;
}
