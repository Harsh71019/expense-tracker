export const ICON_CHOICES = [
  "🍽",
  "🛒",
  "🚕",
  "💡",
  "🏠",
  "⚕",
  "🎬",
  "✈",
  "💰",
  "📈",
  "🎁",
  "☕"
] as const;

export const COLOR_CHOICES = [
  "#f97316",
  "#3b82f6",
  "#eab308",
  "#ec4899",
  "#8b5cf6",
  "#22c55e",
  "#14b8a6",
  "#ef4444"
] as const;

function hexChannels(hex: string): readonly [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexChannels(hex);
  const mix = (channel: number): number => Math.round(channel + (255 - channel) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

export function tint(hex: string, alpha = 0.16): string {
  const [r, g, b] = hexChannels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function glyphFor(category: Readonly<{ icon?: string | undefined; name: string }>): string {
  return category.icon ?? category.name.charAt(0).toUpperCase();
}
