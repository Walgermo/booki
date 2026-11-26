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
          <BookiLocaleProvider defaultCountry="US"><DocumentEditor defaultDocument={documentModel} actor="reviewer" /></BookiLocaleProvider>
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
  } finally {
    await page.close();
  }
});
