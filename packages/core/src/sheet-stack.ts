/**
 * Stacked sheets: where each open sheet sits on screen.
 *
 * A working paper opens on a page; a line on it opens a sheet over it, and
 * that sheet can open another. The sheets stack from the left: while they all
 * fit side by side they are centred; once they do not, the top sheet sits flush
 * right and the ones behind it slide under it. A sheet with too little showing
 * becomes a spine (its title, set vertically); one partly covered keeps a
 * readable strip of its content. A sheet that suits being read beside its
 * parent (a ledger, a voucher) docks next to it on a wide screen instead of
 * covering it.
 *
 * Pure and framework-free: widths in CSS pixels in, positions out.
 */

export type SheetStackGeometry = {
  /** Width of a spine: a sheet with nothing readable showing. Default 44. */
  spine: number;
  /** Gap between sheets that fit side by side. Default 12. */
  gap: number;
  /** Width of each sheet when several share the row. Default 1120. */
  maxWidth: number;
  /** Width of a single sheet. Default 1600. */
  singleMaxWidth: number;
  /** Readable strip kept of a partly covered sheet. Default 220. */
  context: number;
  /** The top sheet must stay this wide for the strip to show. Default 840. */
  minWidthWithContext: number;
  /** Below this the stack is a phone: no margin, spines only. Default 720. */
  narrow: number;
  /** Side margin. Default 16. */
  margin: number;
  /** A sheet with less than this showing is covered (a spine). Default 200. */
  covered: number;
  /** A docked sheet needs the stack at least this wide. Default 1280. */
  dockBreakpoint: number;
  /** A page beside a docked sheet keeps at least this much. Default 640. */
  dockMin: number;
};

export const SHEET_STACK_GEOMETRY: Readonly<SheetStackGeometry> = {
  spine: 44,
  gap: 12,
  maxWidth: 1120,
  singleMaxWidth: 1600,
  context: 220,
  minWidthWithContext: 840,
  narrow: 720,
  margin: 16,
  covered: 200,
  dockBreakpoint: 1280,
  dockMin: 640,
};

export type SheetPlacement = {
  /** Left edge, from the stack's left edge. */
  x: number;
  width: number;
  /** Less than `covered` shows: draw it as a spine. */
  covered: boolean;
  /** Partly under the sheet above it: keep the context strip, hide the rest. */
  overlapped: boolean;
  /** The sheet the person works in. */
  top: boolean;
};

/**
 * Where `count` stacked sheets sit in a stack `width` wide. The last one is
 * the top sheet. `wideTop` lets the top sheet take the single-sheet width
 * when it is alone on screen, as a page often does.
 */
export function layoutSheets(
  width: number,
  count: number,
  options: { wideTop?: boolean; geometry?: Partial<SheetStackGeometry> } = {},
): SheetPlacement[] {
  const g = { ...SHEET_STACK_GEOMETRY, ...options.geometry };
  if (count <= 0) return [];
  const narrow = width < g.narrow;
  const margin = narrow ? 0 : g.margin;
  const room = Math.max(0, width - 2 * margin);
  if (narrow) {
    // A phone: every sheet behind the top is a spine, the top takes the rest.
    const top = Math.max(0, room - g.spine * (count - 1));
    return Array.from({ length: count }, (_, i) => {
      const last = i === count - 1;
      return { x: margin + i * g.spine, width: last ? top : g.spine, covered: !last, overlapped: false, top: last };
    });
  }
  const single = count === 1 ? (options.wideTop === false ? g.maxWidth : g.singleMaxWidth) : g.maxWidth;
  const sheet = Math.min(single, room);
  const together = count * sheet + (count - 1) * g.gap;
  if (together <= room) {
    // Everything fits: centred, side by side.
    const start = margin + (room - together) / 2;
    return Array.from({ length: count }, (_, i) => ({
      x: start + i * (sheet + g.gap),
      width: sheet,
      covered: false,
      overlapped: false,
      top: i === count - 1,
    }));
  }
  // The top sheet sits flush right; those behind slide under it, never closer than a spine apart.
  const topX = margin + room - sheet;
  const placements: SheetPlacement[] = [];
  for (let i = 0; i < count; i++) {
    const last = i === count - 1;
    const x = last ? topX : Math.min(topX - (count - 1 - i) * g.spine, margin + i * (sheet + g.gap));
    placements.push({
      x: Math.max(margin + i * g.spine, x),
      width: sheet,
      covered: false,
      overlapped: false,
      top: last,
    });
  }
  for (let i = 0; i < count - 1; i++) {
    const showing = placements[i + 1]!.x - placements[i]!.x;
    const keepsContext = sheet >= g.minWidthWithContext && showing >= g.context;
    placements[i] = { ...placements[i]!, covered: showing < g.covered && !keepsContext, overlapped: true };
  }
  return placements;
}

export type DockPlan =
  | { docked: false }
  /** The page keeps the left column, the docked sheet takes the right one. */
  | { docked: true; pageWidth: number; sheetWidth: number };

/**
 * Whether a sheet that may dock (a ledger, a voucher) lies beside its page or
 * over it. `preference` is the person's choice, which wins when it fits.
 */
export function planDock(
  width: number,
  options: { preference?: "beside" | "over"; geometry?: Partial<SheetStackGeometry> } = {},
): DockPlan {
  const g = { ...SHEET_STACK_GEOMETRY, ...options.geometry };
  if (options.preference === "over" || width < g.dockBreakpoint) return { docked: false };
  const sheetWidth = Math.min(g.singleMaxWidth, width - g.dockMin);
  return { docked: true, pageWidth: width - sheetWidth, sheetWidth };
}

export type StackSheet = {
  key: string;
  title: string /** Suits being read beside its parent (a ledger, a voucher). */;
  dockable?: boolean;
};

/**
 * The whole stack: `layoutSheets` for what covers what, and when the top
 * sheet may dock and the screen is wide enough, the top sheet beside the one
 * under it instead of over it.
 */
export function layoutStack(
  width: number,
  sheets: readonly StackSheet[],
  options: { preference?: "beside" | "over"; wideTop?: boolean; geometry?: Partial<SheetStackGeometry> } = {},
): { placements: SheetPlacement[]; docked: boolean } {
  const top = sheets.at(-1);
  const dock = top?.dockable && sheets.length > 1 ? planDock(width, options) : ({ docked: false } as const);
  if (!dock.docked) return { placements: layoutSheets(width, sheets.length, options), docked: false };
  // The page column holds every sheet but the top one; the top lies in the right column.
  const under = layoutSheets(dock.pageWidth, sheets.length - 1, options);
  const placements = [
    ...under,
    { x: dock.pageWidth, width: dock.sheetWidth, covered: false, overlapped: false, top: true },
  ];
  return {
    placements: placements.map((placement, i) => ({ ...placement, top: i === sheets.length - 1 })),
    docked: true,
  };
}
