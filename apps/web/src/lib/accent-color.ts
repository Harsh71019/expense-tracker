export type NormalizedHex = `#${string}`;

export type ColorParseResult =
  { success: true; color: NormalizedHex } | { success: false; message: string };

export interface AccentTokenSet {
  accent: NormalizedHex;
  strong: NormalizedHex;
  foreground: NormalizedHex;
  glow: string;
}

export interface DerivedAccentTokens {
  light: AccentTokenSet;
  dark: AccentTokenSet;
}

interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface HslColor {
  h: number;
  s: number;
  l: number;
}

interface ColorCandidate {
  color: NormalizedHex;
  lightness: number;
}

type ThemeVariant = "light" | "dark";

const WHITE: NormalizedHex = "#ffffff";
const DARK_INK: NormalizedHex = "#04140d";
const LIGHT_SURFACE: NormalizedHex = "#f6f8f6";
const DARK_SURFACE: NormalizedHex = "#000000";
const MIN_TEXT_CONTRAST = 4.5;
const MIN_BOUNDARY_CONTRAST = 3;

function rgbToHex(color: RgbColor): NormalizedHex {
  const channel = (value: number): string =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, "0");

  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

function parseHex(value: string): ColorParseResult | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  const digits = match?.[1];
  if (digits === undefined) {
    return null;
  }

  const expanded =
    digits.length === 3
      ? `${digits.charAt(0)}${digits.charAt(0)}${digits.charAt(1)}${digits.charAt(1)}${digits.charAt(2)}${digits.charAt(2)}`
      : digits;

  return { success: true, color: `#${expanded.toLowerCase()}` };
}

function parseRgb(value: string): ColorParseResult | null {
  const match = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(value);
  if (match === null) {
    return null;
  }

  const redText = match[1];
  const greenText = match[2];
  const blueText = match[3];
  if (redText === undefined || greenText === undefined || blueText === undefined) {
    return { success: false, message: "Enter RGB as rgb(0, 0, 0)." };
  }

  const color = {
    r: Number(redText),
    g: Number(greenText),
    b: Number(blueText)
  };
  if (color.r > 255 || color.g > 255 || color.b > 255) {
    return { success: false, message: "RGB channels must be between 0 and 255." };
  }

  return { success: true, color: rgbToHex(color) };
}

function hslToRgb(color: HslColor): RgbColor {
  const saturation = color.s / 100;
  const lightness = color.l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hueSection = color.h / 60;
  const intermediate = chroma * (1 - Math.abs((hueSection % 2) - 1));

  let red = 0;
  let green = 0;
  let blue = 0;

  if (hueSection < 1) {
    red = chroma;
    green = intermediate;
  } else if (hueSection < 2) {
    red = intermediate;
    green = chroma;
  } else if (hueSection < 3) {
    green = chroma;
    blue = intermediate;
  } else if (hueSection < 4) {
    green = intermediate;
    blue = chroma;
  } else if (hueSection < 5) {
    red = intermediate;
    blue = chroma;
  } else {
    red = chroma;
    blue = intermediate;
  }

  const offset = lightness - chroma / 2;
  return {
    r: (red + offset) * 255,
    g: (green + offset) * 255,
    b: (blue + offset) * 255
  };
}

function parseHsl(value: string): ColorParseResult | null {
  const match =
    /^hsl\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)$/i.exec(value);
  if (match === null) {
    return null;
  }

  const hueText = match[1];
  const saturationText = match[2];
  const lightnessText = match[3];
  if (hueText === undefined || saturationText === undefined || lightnessText === undefined) {
    return { success: false, message: "Enter HSL as hsl(0, 0%, 0%)." };
  }

  const hue = Number(hueText);
  const saturation = Number(saturationText);
  const lightness = Number(lightnessText);
  if (!Number.isFinite(hue) || !Number.isFinite(saturation) || !Number.isFinite(lightness)) {
    return { success: false, message: "HSL values must be finite numbers." };
  }
  if (saturation > 100 || lightness > 100) {
    return { success: false, message: "HSL saturation and lightness must be between 0% and 100%." };
  }

  const normalizedHue = ((hue % 360) + 360) % 360;
  return {
    success: true,
    color: rgbToHex(hslToRgb({ h: normalizedHue, s: saturation, l: lightness }))
  };
}

export function parseColorInput(input: unknown): ColorParseResult {
  if (typeof input !== "string") {
    return { success: false, message: "Enter a color value." };
  }

  const value = input.trim();
  if (value === "") {
    return { success: false, message: "Enter a color value." };
  }

  const parsed = parseHex(value) ?? parseRgb(value) ?? parseHsl(value);
  return (
    parsed ?? {
      success: false,
      message: "Use #rrggbb, rgb(0, 0, 0), or hsl(0, 0%, 0%)."
    }
  );
}

function hexToRgb(color: NormalizedHex): RgbColor {
  return {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16)
  };
}

function rgbToHsl(color: RgbColor): HslColor {
  const red = color.r / 255;
  const green = color.g / 255;
  const blue = color.b / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l: lightness * 100 };
  }

  let hue: number;
  if (maximum === red) {
    hue = 60 * (((green - blue) / delta) % 6);
  } else if (maximum === green) {
    hue = 60 * ((blue - red) / delta + 2);
  } else {
    hue = 60 * ((red - green) / delta + 4);
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  return {
    h: (hue + 360) % 360,
    s: saturation * 100,
    l: lightness * 100
  };
}

function linearChannel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(first: NormalizedHex, second: NormalizedHex): number {
  const firstRgb = hexToRgb(first);
  const secondRgb = hexToRgb(second);
  const firstLuminance =
    0.2126 * linearChannel(firstRgb.r) +
    0.7152 * linearChannel(firstRgb.g) +
    0.0722 * linearChannel(firstRgb.b);
  const secondLuminance =
    0.2126 * linearChannel(secondRgb.r) +
    0.7152 * linearChannel(secondRgb.g) +
    0.0722 * linearChannel(secondRgb.b);

  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

function foregroundFor(color: NormalizedHex): NormalizedHex {
  return contrastRatio(color, WHITE) >= contrastRatio(color, DARK_INK) ? WHITE : DARK_INK;
}

function isAccentCompliant(color: NormalizedHex, surface: NormalizedHex): boolean {
  return (
    contrastRatio(color, surface) >= MIN_BOUNDARY_CONTRAST &&
    contrastRatio(color, foregroundFor(color)) >= MIN_TEXT_CONTRAST
  );
}

function candidateAt(hsl: HslColor, lightness: number): ColorCandidate {
  return {
    color: rgbToHex(hslToRgb({ h: hsl.h, s: hsl.s, l: lightness })),
    lightness
  };
}

function preferredCandidate(
  current: ColorCandidate | null,
  candidate: ColorCandidate,
  targetLightness: number,
  theme: ThemeVariant
): ColorCandidate {
  if (current === null) {
    return candidate;
  }

  const currentDistance = Math.abs(current.lightness - targetLightness);
  const candidateDistance = Math.abs(candidate.lightness - targetLightness);
  if (candidateDistance < currentDistance) {
    return candidate;
  }
  if (candidateDistance > currentDistance) {
    return current;
  }

  const candidateWinsTie =
    theme === "light"
      ? candidate.lightness < current.lightness
      : candidate.lightness > current.lightness;
  return candidateWinsTie ? candidate : current;
}

function findAccentCandidate(hsl: HslColor, theme: ThemeVariant): ColorCandidate {
  const surface = theme === "light" ? LIGHT_SURFACE : DARK_SURFACE;
  const exact = candidateAt(hsl, hsl.l);
  if (isAccentCompliant(exact.color, surface)) {
    return exact;
  }

  let best: ColorCandidate | null = null;
  for (let lightness = 0; lightness <= 100; lightness += 1) {
    const candidate = candidateAt(hsl, lightness);
    if (isAccentCompliant(candidate.color, surface)) {
      best = preferredCandidate(best, candidate, hsl.l, theme);
    }
  }

  return best ?? candidateAt(hsl, theme === "light" ? 25 : 75);
}

function findStrongCandidate(
  hsl: HslColor,
  accent: ColorCandidate,
  foreground: NormalizedHex,
  theme: ThemeVariant
): ColorCandidate {
  const surface = theme === "light" ? LIGHT_SURFACE : DARK_SURFACE;
  const targetLightness = Math.min(
    100,
    Math.max(0, accent.lightness + (foreground === WHITE ? -8 : 8))
  );
  let best: ColorCandidate | null = null;

  for (let lightness = 0; lightness <= 100; lightness += 1) {
    const candidate = candidateAt(hsl, lightness);
    if (
      candidate.color !== accent.color &&
      contrastRatio(candidate.color, surface) >= MIN_BOUNDARY_CONTRAST &&
      contrastRatio(candidate.color, foreground) >= MIN_TEXT_CONTRAST
    ) {
      best = preferredCandidate(best, candidate, targetLightness, theme);
    }
  }

  return best ?? accent;
}

function deriveTokenSet(color: NormalizedHex, theme: ThemeVariant): AccentTokenSet {
  const hsl = rgbToHsl(hexToRgb(color));
  const accent = findAccentCandidate(hsl, theme);
  const foreground = foregroundFor(accent.color);
  const strong = findStrongCandidate(hsl, accent, foreground, theme);
  const accentRgb = hexToRgb(accent.color);

  return {
    accent: accent.color,
    strong: strong.color,
    foreground,
    glow: `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.15)`
  };
}

export function deriveCustomAccentTokens(color: NormalizedHex): DerivedAccentTokens {
  return {
    light: deriveTokenSet(color, "light"),
    dark: deriveTokenSet(color, "dark")
  };
}

export function resemblesExpenseColor(color: NormalizedHex): boolean {
  const hsl = rgbToHsl(hexToRgb(color));
  return hsl.s >= 50 && (hsl.h <= 20 || hsl.h >= 340);
}
