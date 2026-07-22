import type { ReactNode } from "react";

import { CATEGORY_ICONS, isCategoryIconKey } from "../model/icon-registry";

type IconGlyphProps = Readonly<{
  value: string;
  size?: number;
  className?: string;
}>;

/**
 * `value` is either a known lucide icon key (`category.icon`, e.g.
 * "shopping-cart") or arbitrary short text (a fallback initial, "∅", a
 * direction arrow) — this is the one place that decides which of those it is
 * and renders accordingly, so no call site has to.
 */
export function IconGlyph({ value, size = 18, className }: IconGlyphProps): ReactNode {
  if (isCategoryIconKey(value)) {
    const Icon = CATEGORY_ICONS[value];
    return <Icon size={size} className={className} aria-hidden="true" />;
  }
  return (
    <span className={`truncate leading-none ${className ?? ""}`} aria-hidden="true">
      {value}
    </span>
  );
}
