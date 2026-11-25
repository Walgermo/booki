import { cleanup, render, act } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { StackSheet } from "@booki-aui/core/sheet-stack";
import { BookiLocaleProvider } from "./locale.js";
import { SheetStack } from "./sheet-stack.js";

afterEach(() => cleanup());

it("lays the sheets out in the measured width", async () => {
  let report: ((entries: { contentRect: { width: number } }[]) => void) | null = null;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: typeof report) {
        report = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
  render(
    <BookiLocaleProvider defaultCountry="US">
      <SheetStack
        defaultSheets={[
          { key: "a", title: "A" },
          { key: "b", title: "B" },
          { key: "c", title: "C" },
        ]}
        renderSheet={() => null}
      />
    </BookiLocaleProvider>,
  );
  await act(async () => report!([{ contentRect: { width: 694 } }]));
  const widths = [...document.querySelectorAll<HTMLElement>('[data-slot="sheet-stack-sheet"]')].map(
    (s) => s.style.width,
  );
  vi.unstubAllGlobals();
  expect(widths.at(-1)).toBe(`${694 - 88}px`);
});

it("lays out controlled sheets in the measured width, as they open", async () => {
  let report: ((entries: { contentRect: { width: number } }[]) => void) | null = null;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(cb: typeof report) {
        report = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
  let open: (sheet: StackSheet) => void = () => {};
  function Host() {
    const [sheets, setSheets] = useState<StackSheet[]>([{ key: "a", title: "A" }]);
    open = (sheet) => setSheets((all) => [...all, sheet]);
    return <SheetStack sheets={sheets} onSheetsChange={setSheets} renderSheet={() => null} />;
  }
  render(
    <BookiLocaleProvider defaultCountry="US">
      <Host />
    </BookiLocaleProvider>,
  );
  await act(async () => report!([{ contentRect: { width: 694 } }]));
  await act(async () => open({ key: "b", title: "B" }));
  await act(async () => open({ key: "c", title: "C" }));
  const widths = [...document.querySelectorAll<HTMLElement>('[data-slot="sheet-stack-sheet"]')].map(
    (s) => s.style.width,
  );
  vi.unstubAllGlobals();
  expect(widths).toEqual(["44px", "44px", `${694 - 88}px`]);
});
