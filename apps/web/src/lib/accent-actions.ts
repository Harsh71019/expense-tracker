"use server";

import { cookies } from "next/headers";

import {
  ACCENT_COOKIE_NAME,
  ACCENT_PRESETS,
  DEFAULT_ACCENT_COLOR,
  accentPreferenceKey,
  isAccentPreset,
  serializeAccentPreference
} from "./accent";
import type { AccentActionState, AccentPreference } from "./accent";
import { parseColorInput } from "./accent-color";

const COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax"
} as const;

async function persistAccent(preference: AccentPreference): Promise<void> {
  const cookieStore = await cookies();
  const serialized = serializeAccentPreference(preference);
  if (serialized === null) {
    cookieStore.delete(ACCENT_COOKIE_NAME);
    return;
  }
  cookieStore.set(ACCENT_COOKIE_NAME, serialized, COOKIE_OPTIONS);
}

export async function resetAccentPreference(): Promise<void> {
  await persistAccent({ kind: "default" });
}

export async function applyAccentPreference(
  _previousState: AccentActionState,
  formData: FormData
): Promise<AccentActionState> {
  const selection = formData.get("accentSelection");
  if (typeof selection !== "string") {
    return { status: "error", message: "Choose an accent color.", appliedKey: null };
  }

  if (isAccentPreset(selection)) {
    const preference: AccentPreference =
      selection === ACCENT_PRESETS.default
        ? { kind: "default" }
        : { kind: "preset", preset: selection };
    await persistAccent(preference);
    return {
      status: "success",
      message: selection === ACCENT_PRESETS.default ? "Applied Vyaya default." : "Applied preset.",
      appliedKey: accentPreferenceKey(preference)
    };
  }

  if (selection !== "custom") {
    return { status: "error", message: "Choose a valid accent color.", appliedKey: null };
  }

  const parsed = parseColorInput(formData.get("accentColor"));
  if (!parsed.success) {
    return { status: "error", message: parsed.message, appliedKey: null };
  }

  if (parsed.color === DEFAULT_ACCENT_COLOR) {
    const preference: AccentPreference = { kind: "default" };
    await persistAccent(preference);
    return {
      status: "success",
      message: "Applied Vyaya default.",
      appliedKey: accentPreferenceKey(preference)
    };
  }

  const preference: AccentPreference = { kind: "custom", color: parsed.color };
  await persistAccent(preference);
  return {
    status: "success",
    message: `Applied custom accent ${parsed.color}.`,
    appliedKey: accentPreferenceKey(preference)
  };
}
