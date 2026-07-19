import type { CSSProperties } from "react";

import type { AccentPreference } from "./accent";
import { deriveCustomAccentTokens } from "./accent-color";

export interface AccentChoiceStyle extends CSSProperties {
  "--accent-choice-light": string;
  "--accent-choice-light-strong": string;
  "--accent-choice-light-foreground": string;
  "--accent-choice-light-glow": string;
  "--accent-choice-dark": string;
  "--accent-choice-dark-strong": string;
  "--accent-choice-dark-foreground": string;
  "--accent-choice-dark-glow": string;
}

export function accentDataAttribute(preference: AccentPreference): string | undefined {
  if (preference.kind === "default") {
    return undefined;
  }
  return preference.kind === "preset" ? preference.preset : "custom";
}

export function accentChoiceStyle(preference: AccentPreference): AccentChoiceStyle | undefined {
  if (preference.kind !== "custom") {
    return undefined;
  }

  const tokens = deriveCustomAccentTokens(preference.color);
  return {
    "--accent-choice-light": tokens.light.accent,
    "--accent-choice-light-strong": tokens.light.strong,
    "--accent-choice-light-foreground": tokens.light.foreground,
    "--accent-choice-light-glow": tokens.light.glow,
    "--accent-choice-dark": tokens.dark.accent,
    "--accent-choice-dark-strong": tokens.dark.strong,
    "--accent-choice-dark-foreground": tokens.dark.foreground,
    "--accent-choice-dark-glow": tokens.dark.glow
  };
}
