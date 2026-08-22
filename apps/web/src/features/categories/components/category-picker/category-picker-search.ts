import { normalizeCategorySearchText, type Category } from "@treasury-ops/shared";

export function textContains(haystack: string, needle: string): boolean {
  return haystack.indexOf(needle) !== -1;
}

export function matchesSearch(
  category: Category,
  parentName: string | undefined,
  query: string
): boolean {
  if (query === "") return true;
  const haystack = normalizeCategorySearchText(
    parentName === undefined ? category.name : `${category.name} ${parentName}`
  );
  return textContains(haystack, query);
}
