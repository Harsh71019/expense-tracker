import {
  Baby,
  Briefcase,
  Car,
  Coffee,
  Dumbbell,
  Film,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Laptop,
  PawPrint,
  Percent,
  PiggyBank,
  Plane,
  ReceiptText,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Train,
  Utensils,
  UtensilsCrossed,
  Wrench,
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
  "laptop",
  "coffee",
  "dumbbell",
  "gift",
  "graduation-cap",
  "heart-pulse",
  "paw-print",
  "piggy-bank",
  "receipt-text",
  "smartphone",
  "train",
  "wrench",
  "baby"
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
  laptop: Laptop,
  coffee: Coffee,
  dumbbell: Dumbbell,
  gift: Gift,
  "graduation-cap": GraduationCap,
  "heart-pulse": HeartPulse,
  "paw-print": PawPrint,
  "piggy-bank": PiggyBank,
  "receipt-text": ReceiptText,
  smartphone: Smartphone,
  train: Train,
  wrench: Wrench,
  baby: Baby
};

export function isCategoryIconKey(value: string): value is CategoryIconKey {
  return Object.hasOwn(CATEGORY_ICONS, value);
}
