import { BookiError } from "@booki-aui/core/msg";
import { layoutStack, type SheetPlacement, type StackSheet } from "@booki-aui/core/sheet-stack";
import { createChange, definePrimitive } from "@ui-sdk/core";

export type Options = {
  sheets?: StackSheet[];
  defaultSheets?: StackSheet[];
  /** The stack's width in CSS pixels; the React wrapper measures it. */
  width?: number;
  /** The person's choice for a sheet that may dock. Default "beside". */
  dock?: "beside" | "over";
  onSheetsChange?: (sheets: StackSheet[], details: { reason: string; source?: string; cancel?: () => void }) => void;
};

export function derive(sheets: StackSheet[], options: Options) {
  const { placements, docked } = layoutStack(options.width ?? 1440, sheets, { preference: options.dock });
  return {
    placements: placements as SheetPlacement[],
    docked,
    top: sheets.at(-1)?.key ?? null,
    // What the agent reads: each open sheet, and whether it is behind.
    open: sheets.map((sheet, i) => ({
      key: sheet.key,
      title: sheet.title,
      top: i === sheets.length - 1,
      covered: placements[i]?.covered ?? false,
    })),
  };
}

/**
 * Stacked sheets: a page, and what was opened from it, each over the last
 * (or a ledger docked beside it on a wide screen). The app opens sheets; a
 * person or an agent goes back with `back(key)` (closing everything above that
 * sheet) or `close()` (the top one). Going back changes no data, so an agent
 * may do it. Escape closes the top sheet.
 */
export const sheetStack = definePrimitive({
  name: "sheet-stack",
  options: {
    sheets: "value",
    defaultSheets: "value",
    width: "number",
    dock: "string",
    onSheetsChange: "callback",
  },
  controlled: ["open", "top", "docked"],
  state: (options: Options) => {
    const sheets = options.sheets ?? options.defaultSheets ?? [];
    return { sheets, ...derive(sheets, options) };
  },
  sync: (options: Options) => (options.sheets === undefined ? {} : { sheets: options.sheets }),
  api: (context) => {
    const change = createChange(context);
    context.onOptions((options) => context.store.set(derive(options.sheets ?? context.store.get().sheets, options)));
    const commit = (next: StackSheet[], reason: string, event?: Event) => {
      const ok = change("sheets", next, { reason, event });
      if (ok && context.options().sheets === undefined) context.store.set(derive(next, context.options()));
      return ok;
    };
    return {
      /** Back to the sheet `key`: everything above it closes. */
      back: (key: string, event?: Event) => {
        const sheets = context.store.get().sheets;
        const index = sheets.findIndex((sheet) => sheet.key === String(key));
        if (index < 0) {
          throw new BookiError("sheets.no-sheet", {
            key: String(key),
            keys: sheets.map((sheet) => sheet.key).join(", ") || "none",
          });
        }
        if (index === sheets.length - 1) return false;
        return commit(sheets.slice(0, index + 1), "back", event);
      },
      /** Close the top sheet. The first sheet (the page) stays. */
      close: (event?: Event) => {
        const sheets = context.store.get().sheets;
        if (sheets.length <= 1) return false;
        return commit(sheets.slice(0, -1), "close", event);
      },
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "region",
      state: (state) => ({ sheets: state.sheets, placements: state.placements, docked: state.docked }),
      on: {
        keydown: (event, { api }) => {
          const key = event as KeyboardEvent;
          if (key.key !== "Escape" || key.defaultPrevented) return;
          // An open menu or dialog inside a sheet owns Escape first.
          const target = key.target as Element | null;
          if (target?.closest?.('[role="dialog"], [role="menu"], [role="listbox"]')) return;
          if (api.close(event)) key.preventDefault();
        },
      },
    }),
    // A sheet behind the top: its spine or context strip goes back to it.
    back: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }, event) => {
        api.back(String(key), event);
      },
    }),
    // The trail above the stack: one per sheet behind the top.
    crumb: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }, event) => {
        api.back(String(key), event);
      },
    }),
    close: slot({
      attrs: () => ({ type: "button" }),
      press: ({ api }, event) => {
        api.close(event);
      },
    }),
  }),
  agent: { actions: ["back", "close"] },
});
