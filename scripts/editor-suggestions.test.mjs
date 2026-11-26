import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright-core";

let browser;
let outputFiles;
before(async () => {
  ({ outputFiles } = await build({
    stdin: {
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { DocumentEditor } from "@booki-aui/react/document-editor";
        import { BookiLocaleProvider } from "@booki-aui/react";
        import "@booki-aui/styles";
        const documentModel = { id: "paper", version: 1, blocks: [{ id: "one", type: "paragraph", text: "" }], proposals: [] };
        createRoot(document.querySelector("main")).render(
          <BookiLocaleProvider defaultCountry="US"><DocumentEditor defaultDocument={documentModel} mentions={[{kind:"file", id:"cut-off", label:"Cut-off sample.xlsx"}]} actor="reviewer" /></BookiLocaleProvider>
        );
      `,
      resolveDir: fileURLToPath(new URL("../apps/www/", import.meta.url)),
      loader: "jsx",
    },
    bundle: true,
    outfile: "editor.js",
    write: false,
    logLevel: "silent",
    define: { "process.env.NODE_ENV": '"production"' },
  }));
  browser = await chromium.launch({ channel: "chrome" });
});
after(async () => browser?.close());

async function openEditor() {
  const page = await browser.newPage();
  await page.setContent("<main></main>");
  await page.addStyleTag({ content: outputFiles.find((file) => file.path.endsWith(".css")).text });
  await page.addScriptTag({ content: outputFiles.find((file) => file.path.endsWith(".js")).text });
  return page;
}

test("a pointer click below an open suggestion list adds a block", async () => {
  for (const focusList of [false, true]) {
    const page = await openEditor();
    const blocks = page.getByRole("textbox");
    await blocks.first().fill("/");
    if (focusList) await blocks.first().press("Alt+ArrowDown");
    await page.getByRole("listbox").waitFor();
    await page.getByRole("button", { name: "Add a block" }).click();
    assert.equal(await blocks.count(), 2);
    await page.getByRole("listbox").waitFor({ state: "detached" });
    await page.close();
  }
});

test("keyboard undo restores a split, keeps editing focus, and redo recreates both blocks", async () => {
  const page = await openEditor();
  try {
    const blocks = page.getByRole("textbox");
    await blocks.first().fill("Revenue estimate");
    await blocks.first().evaluate((el) => el.setSelectionRange(7, 7));
    await blocks.first().press("Enter");
    await page.waitForFunction(() => document.activeElement?.value === " estimate");
    await page.keyboard.press("Control+z");
    await page.waitForFunction(() => document.activeElement?.value === "Revenue estimate");
    assert.equal(await blocks.count(), 1);
    await page.getByRole("button", { name: "Redo" }).click();
    await blocks.nth(1).waitFor();
    assert.deepEqual(await blocks.evaluateAll((areas) => areas.map((el) => el.value)), ["Revenue", " estimate"]);
    await page.getByRole("button", { name: "Undo" }).click();
    await page.waitForFunction(() => document.activeElement?.value === "Revenue estimate");
    await page.keyboard.press("Control+z");
    assert.equal(await blocks.first().inputValue(), "");
    await page.keyboard.type("Other");
    assert.equal(await page.getByRole("button", { name: "Redo" }).isDisabled(), true);
    for (const [inputType, expected] of [
      ["historyUndo", ""],
      ["historyRedo", "Other"],
    ]) {
      const canceled = await blocks
        .first()
        .evaluate(
          (el, type) =>
            !el.dispatchEvent(new InputEvent("beforeinput", { inputType: type, bubbles: true, cancelable: true })),
          inputType,
        );
      assert.ok(canceled, inputType);
      assert.equal(await blocks.first().inputValue(), expected);
    }
  } finally {
    await page.close();
  }
});

test("slash options preview their formats and keyboard selection applies the chosen heading", async () => {
  const page = await openEditor();
  try {
    const area = page.getByRole("textbox");
    await area.fill("/");
    const menu = page.getByRole("listbox");
    const label = (name) =>
      menu.getByRole("option", { name, exact: true }).locator('[data-slot="document-editor-option-label"]');
    const sizes = await Promise.all(
      ["Heading 1", "Heading 2", "Heading 3", "Text"].map((name) =>
        label(name).evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
      ),
    );
    assert.ok(sizes.every((n, i) => !i || sizes[i - 1] > n));
    assert.equal(await label("Bulleted list").locator('[aria-hidden="true"]').innerText(), "•");
    assert.equal(await label("Quote").evaluate((el) => getComputedStyle(el).fontStyle), "italic");
    await area.press("Alt+ArrowDown");
    await menu.press("ArrowDown");
    await menu.press("Enter");
    assert.equal(await area.getAttribute("data-level"), "1");
    assert.equal(await area.inputValue(), "");
  } finally {
    await page.close();
  }
});

test("a tagged source stays highlighted while typing, wrapping, selecting and undoing", async () => {
  const page = await openEditor();
  try {
    await page.setViewportSize({ width: 240, height: 640 });
    const area = page.getByRole("textbox");
    const prefix = "Checked the original figures in ";
    await area.fill(prefix + "@cut");
    await area.press("Enter");
    const text = prefix + "@Cut-off sample.xlsx ";
    assert.equal(await area.inputValue(), text);
    const layer = page.locator('[data-slot="document-editor-highlights"]');
    const tag = layer.locator('[data-slot="document-editor-highlight"]');
    assert.equal(await tag.innerText(), "@Cut-off sample.xlsx");
    assert.equal(await layer.getAttribute("aria-hidden"), "true");
    const metrics = await area.evaluate((el) => {
      const a = getComputedStyle(el),
        mirror = el.previousElementSibling,
        b = getComputedStyle(mirror);
      const rect = el.getBoundingClientRect(),
        back = mirror.getBoundingClientRect();
      return {
        native: [rect.x, rect.y, rect.width, a.font, a.letterSpacing, a.padding],
        overlay: [back.x, back.y, back.width, b.font, b.letterSpacing, b.padding],
        multiline: rect.height > parseFloat(a.lineHeight) * 2,
      };
    });
    assert.deepEqual(metrics.native, metrics.overlay);
    assert.ok(metrics.multiline);
    await page.waitForFunction(() => document.activeElement?.selectionStart === document.activeElement?.value?.length);
    await page.keyboard.type("verified");
    assert.equal(await area.inputValue(), text + "verified");
    assert.equal(await layer.textContent(), await area.inputValue());
    await area.evaluate((el, start) => el.setSelectionRange(start, start + 20), prefix.length);
    await page.keyboard.press("Backspace");
    assert.equal(await tag.count(), 0);
    await area.press("Control+z");
    assert.equal(await tag.innerText(), "@Cut-off sample.xlsx");
  } finally {
    await page.close();
  }
});
