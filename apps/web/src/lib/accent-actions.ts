"use server";

import { cookies } from "next/headers";

import {
  ACCENT_COOKIE_NAME,
  ACCENT_PRESETS,
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

export async function selectAccentPreset(formData: FormData): Promise<void> {
  const value = formData.get("accent");
  if (typeof value !== "string" || !isAccentPreset(value)) {
    return;
  }

  await persistAccent(
    value === ACCENT_PRESETS.default ? { kind: "default" } : { kind: "preset", preset: value }
  );
}

export async function resetAccentPreference(): Promise<void> {
  await persistAccent({ kind: "default" });
}

export async function saveCustomAccent(
  _previousState: AccentActionState,
  formData: FormData
): Promise<AccentActionState> {
  const parsed = parseColorInput(formData.get("accentColor"));
  if (!parsed.success) {
    return { status: "error", message: parsed.message };
  }

  await persistAccent({ kind: "custom", color: parsed.color });
  return { status: "success", message: `Applied custom accent ${parsed.color}.` };
}
