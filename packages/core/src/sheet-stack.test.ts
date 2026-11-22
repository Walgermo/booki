import { describe, expect, it } from "vitest";
import { SHEET_STACK_GEOMETRY as G, layoutSheets, layoutStack, planDock } from "./sheet-stack.js";

describe("layoutSheets", () => {
  it("centres sheets that fit side by side", () => {
    const [a, b] = layoutSheets(2600, 2);
    expect(a).toMatchObject({ width: 1120, covered: false, overlapped: false, top: false });
    expect(b!.x - a!.x).toBe(1120 + G.gap);
    expect(a!.x).toBe(2600 - b!.x - 1120); // same space on both sides
  });

  it("puts the top sheet flush right and the ones behind under it", () => {
    const sheets = layoutSheets(1440, 3);
    const top = sheets.at(-1)!;
    expect(top).toMatchObject({ top: true, x: 1440 - G.margin - 1120 });
    expect(sheets.slice(0, -1).every((sheet) => sheet.overlapped)).toBe(true);
    // never closer than a spine apart, and never off the left edge
    for (let i = 1; i < sheets.length; i++) expect(sheets[i]!.x - sheets[i - 1]!.x).toBeGreaterThanOrEqual(G.spine);
    expect(sheets[0]!.x).toBeGreaterThanOrEqual(G.margin);
  });

  it("keeps a readable strip of the sheet below when there is room, a spine when not", () => {
    const [behind] = layoutSheets(1440, 2);
    expect(behind).toMatchObject({ overlapped: true, covered: false });
    const deep = layoutSheets(1200, 4);
    expect(deep.slice(0, 2).every((sheet) => sheet.covered)).toBe(true);
  });

  it("on a phone shows spines and gives the rest to the top sheet", () => {
    const sheets = layoutSheets(390, 3);
    expect(sheets.map((sheet) => sheet.width)).toEqual([44, 44, 390 - 88]);
    expect(sheets.map((sheet) => sheet.covered)).toEqual([true, true, false]);
  });

  it("gives a lone page the wide width", () => {
    expect(layoutSheets(2000, 1)[0]!.width).toBe(1600);
    expect(layoutSheets(2000, 1, { wideTop: false })[0]!.width).toBe(1120);
  });
});

describe("planDock", () => {
  it("docks beside the page on a wide screen, keeping the page's column", () => {
    expect(planDock(1440)).toEqual({ docked: true, pageWidth: 640, sheetWidth: 800 });
    expect(planDock(3000)).toEqual({ docked: true, pageWidth: 1400, sheetWidth: 1600 });
  });

  it("lies over the page on a narrow screen, or when the person chose that", () => {
    expect(planDock(1200)).toEqual({ docked: false });
    expect(planDock(1440, { preference: "over" })).toEqual({ docked: false });
  });
});

describe("layoutStack", () => {
  it("docks a ledger sheet beside its page on a wide screen", () => {
    const { placements, docked } = layoutStack(1440, [
      { key: "page", title: "05.3" },
      { key: "gl", title: "Hovedbok", dockable: true },
    ]);
    expect(docked).toBe(true);
    expect(placements.map((p) => [p.x >= 0, p.width, p.covered, p.top])).toEqual([
      [true, 640, false, false],
      [true, 800, false, true],
    ]);
  });

  it("covers the page when the top sheet does not dock", () => {
    const { placements, docked } = layoutStack(1440, [
      { key: "page", title: "05.3" },
      { key: "row", title: "Linje 4" },
    ]);
    expect(docked).toBe(false);
    expect(placements[0]!.overlapped).toBe(true);
  });
});
