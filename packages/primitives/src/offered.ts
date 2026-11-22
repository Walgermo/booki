import { closest, LISTED_WHOLE } from "@booki/core/closest";
import { BookiError } from "@booki/core/msg";

export type OfferedItem = { value: string; label: string };

/**
 * A select's items as the snapshot shows them: all of a short list, none of a
 * long one. A chart of accounts in every snapshot is most of what the agent
 * reads, and it is always one `query` away.
 */
export const shownItems = (items: OfferedItem[]): OfferedItem[] => (items.length <= LISTED_WHOLE ? items : []);

/** How to find an item in a list too long to show, or "" for a short one. Shown in the snapshot. */
export const itemsHint = (items: OfferedItem[]): string =>
  items.length <= LISTED_WHOLE
    ? ""
    : `${items.length} items, not listed here: query({ within: <this ref>, text: "a code or a whole word" }) finds one; without text it lists the first 50.`;

/**
 * Throws the refusal for a value the list lacks: every item of a short list,
 * the nearest of a long one and how to find the rest.
 */
export function refuseUnknown(code: string, items: OfferedItem[], raw: unknown): never {
  const value = String(raw).slice(0, 80);
  if (items.length <= LISTED_WHOLE) {
    throw new BookiError(code as never, { value, items: items.map((i) => i.label).join(", ") || "(none)" } as never);
  }
  const near = closest(items, raw, (item) => item.label, 8);
  throw new BookiError(
    `${code}-more` as never,
    { value, items: near.map((i) => i.label).join(", "), count: items.length } as never,
  );
}
