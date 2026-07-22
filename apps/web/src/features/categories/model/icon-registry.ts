import {
  Briefcase,
  Car,
  Film,
  Home,
  Laptop,
  Percent,
  Plane,
  ShoppingBag,
  ShoppingCart,
  Utensils,
  UtensilsCrossed,
  Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const ICON_CHOICES = [
  "utensils",
  "shopping-cart",
  "utensils-crossed",
  "car",
  "shopping-bag",
  "zap",
  "home",
  "plane",
  "film",
  "briefcase",
  "percent",
  "laptop"
] as const;

export type CategoryIconKey = (typeof ICON_CHOICES)[number];

export const CATEGORY_ICONS: Record<CategoryIconKey, LucideIcon> = {
  utensils: Utensils,
  "shopping-cart": ShoppingCart,
  "utensils-crossed": UtensilsCrossed,
  car: Car,
  "shopping-bag": ShoppingBag,
  zap: Zap,
  home: Home,
  plane: Plane,
  film: Film,
  briefcase: Briefcase,
  percent: Percent,
  laptop: Laptop
};

export function isCategoryIconKey(value: string): value is CategoryIconKey {
  return Object.hasOwn(CATEGORY_ICONS, value);
}
