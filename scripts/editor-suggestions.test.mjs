import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright-core";

test("a pointer click below an open suggestion list adds a block", async () => {
  const { outputFiles } = await build({
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
  });
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    for (const focusList of [false, true]) {
      const page = await browser.newPage();
      await page.setContent("<main></main>");
      await page.addStyleTag({ content: outputFiles.find((file) => file.path.endsWith(".css")).text });
      await page.addScriptTag({ content: outputFiles.find((file) => file.path.endsWith(".js")).text });
      const blocks = page.getByRole("textbox");
      await blocks.first().fill("/");
      if (focusList) await blocks.first().press("Alt+ArrowDown");
      await page.getByRole("listbox").waitFor();
      await page.getByRole("button", { name: "Add a block" }).click();
      assert.equal(await blocks.count(), 2);
      await page.getByRole("listbox").waitFor({ state: "detached" });
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
