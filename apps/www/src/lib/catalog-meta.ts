import { getCatalogItem } from "../catalog";
import { catalogText } from "../catalog-nb";
import type { PageMeta } from "./lang";

export function catalogMeta(name: string): PageMeta {
  const item = getCatalogItem(name);
  if (!item) throw new Error(`Unknown documentation page: ${name}`);
  const en = catalogText(item, "en");
  const nb = catalogText(item, "nb");
  return {
    title: { en: `${en.title} · Booki`, nb: `${nb.title} · Booki` },
    description: { en: en.description, nb: nb.description },
  };
}
