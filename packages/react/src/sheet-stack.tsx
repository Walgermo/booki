import type { SheetPlacement, StackSheet } from "@booki-aui/core/sheet-stack";
import type { BookiChangeDetails } from "./change-details.js";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useBookiLocaleOptional } from "./locale.js";
import { sheetStack } from "@booki-aui/primitives/sheet-stack";

const TAGS = {
  root: "div",
  back: "button",
  crumb: "button",
  close: "button",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof sheetStack, typeof TAGS> = createParts(sheetStack, TAGS);
const SheetStackRoot: (typeof parts)["Root"] = parts.Root;
const SheetStackBack: (typeof parts)["Back"] = parts.Back;
const SheetStackCrumb: (typeof parts)["Crumb"] = parts.Crumb;
const SheetStackClose: (typeof parts)["Close"] = parts.Close;

const COPY = {
  EN: { label: "Open sheets", trail: "Where you are", backTo: "Back to", close: "Close the top sheet" },
  NO: { label: "Åpne sider", trail: "Hvor du er", backTo: "Tilbake til", close: "Lukk øverste side" },
} as const;

export type SheetStackProps = {
  sheets?: StackSheet[];
  defaultSheets?: StackSheet[];
  onSheetsChange?: (sheets: StackSheet[], details: BookiChangeDetails) => void;
  /** The person's choice for a sheet that may dock. Default "beside". */
  dock?: "beside" | "over";
  /** What each sheet shows. Only the top sheet takes input; the rest are inert. */
  renderSheet: (sheet: StackSheet, place: SheetPlacement) => ReactNode;
  className?: string;
  "aria-label"?: string;
};

type RootState = { sheets: StackSheet[]; placements: SheetPlacement[]; docked: boolean };

/** Follows the stack's width, so the layout follows the window. */
function useWidth() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Measure at once: an observer reports only when the page renders, which a
    // background tab may not do yet.
    const now = Math.round(node.getBoundingClientRect().width);
    if (now > 0) setWidth(now);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry?.contentRect.width ?? 0)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * A page and the sheets opened from it, stacked. The top sheet takes input;
 * a sheet behind it shows a readable strip, or a spine with its title, that
 * goes back to it. A trail above names the whole chain, and Escape closes the
 * top sheet. The app decides what opens (append to `sheets`); going back is
 * the control's, for a person or an agent.
 */
/**
 * When the top sheet changes (one opens, or a person goes back), focus moves
 * to its title, so a keyboard or screen-reader user lands where the work is.
 * Not on first render: opening a page does not steal focus.
 */
function useFocusTop(ref: { current: HTMLElement | null }) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const read = () =>
      frame.querySelector<HTMLElement>('[data-slot="sheet-stack-sheet"][data-top] [data-slot="sheet-stack-title"]');
    last.current = read()?.id ?? null;
    const observer = new MutationObserver(() => {
      const title = read();
      const id = title?.id ?? null;
      if (id === last.current) return;
      last.current = id;
      // Only when the person was working in the stack (or focus fell to the
      // page as a pressed button left): an agent opening a sheet elsewhere does
      // not pull focus away from what the person is typing.
      const active = document.activeElement;
      if (title && (active === null || active === document.body || frame.contains(active)))
        title.focus({ preventScroll: true });
    });
    observer.observe(frame, { subtree: true, attributes: true, attributeFilter: ["data-top"], childList: true });
    return () => observer.disconnect();
  }, [ref]);
}

function SheetStack({
  sheets,
  defaultSheets,
  onSheetsChange,
  dock,
  renderSheet,
  className,
  "aria-label": ariaLabel,
}: SheetStackProps) {
  const { country } = useBookiLocaleOptional();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const [ref, width] = useWidth();
  const baseId = useId();
  useFocusTop(ref);
  return (
    <div ref={ref} data-slot="sheet-stack-frame" className={className}>
      <SheetStackRoot
        sheets={sheets}
        defaultSheets={defaultSheets}
        onSheetsChange={onSheetsChange}
        width={width}
        dock={dock}
        aria-label={ariaLabel ?? copy.label}
      >
        {(state: RootState) => (
          <>
            <nav data-slot="sheet-stack-trail" aria-label={copy.trail}>
              <ol>
                {state.sheets.map((sheet, i) =>
                  i === state.sheets.length - 1 ? (
                    <li key={sheet.key} aria-current="page">
                      {sheet.title}
                    </li>
                  ) : (
                    <li key={sheet.key}>
                      <SheetStackCrumb value={sheet.key}>{sheet.title}</SheetStackCrumb>
                    </li>
                  ),
                )}
              </ol>
              {state.sheets.length > 1 ? (
                <SheetStackClose aria-label={copy.close}>
                  <kbd>Esc</kbd>
                </SheetStackClose>
              ) : null}
            </nav>
            <div data-slot="sheet-stack-stage" data-docked={state.docked ? "" : undefined}>
              {state.sheets.map((sheet, i) => {
                const place = state.placements[i];
                if (!place) return null;
                const titleId = `${baseId}-${i}-title`;
                return (
                  <section
                    key={sheet.key}
                    data-slot="sheet-stack-sheet"
                    data-top={place.top ? "" : undefined}
                    data-covered={place.covered ? "" : undefined}
                    data-overlapped={place.overlapped ? "" : undefined}
                    aria-labelledby={titleId}
                    style={{ width: place.width, transform: `translateX(${place.x}px)`, zIndex: i + 1 }}
                  >
                    {!place.top && (place.covered || place.overlapped) ? (
                      <SheetStackBack
                        value={sheet.key}
                        data-spine={place.covered ? "" : undefined}
                        aria-label={`${copy.backTo} ${sheet.title}`}
                      >
                        {place.covered ? <span data-slot="sheet-stack-spine-title">{sheet.title}</span> : null}
                      </SheetStackBack>
                    ) : null}
                    <div data-slot="sheet-stack-content" inert={!place.top}>
                      <h2 id={titleId} data-slot="sheet-stack-title" tabIndex={-1}>
                        {sheet.title}
                      </h2>
                      {renderSheet(sheet, place)}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </SheetStackRoot>
    </div>
  );
}

export { SheetStack, SheetStackBack, SheetStackClose, SheetStackCrumb, SheetStackRoot, sheetStack };
export type { SheetPlacement, StackSheet };
