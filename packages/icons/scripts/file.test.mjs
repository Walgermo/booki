import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { fileIconNames, getFileIconName } from "@booki-aui/icons/file";
import { BanknoteIcon, DocumentIcon, DocumentPdfIcon, FileIcon } from "@booki-aui/icons/react";
import { build } from "esbuild";

const cases = [
  [{ name: "Report.PDF", type: "application/octet-stream" }, "document-pdf"],
  [{ type: "Application/PDF; charset=UTF-8" }, "document-pdf"],
  [{ name: "ledger.CSV", type: "text/plain" }, "document-table"],
  [{ name: "accounts.xlsx" }, "document-table"],
  [{ type: "application/vnd.oasis.opendocument.spreadsheet" }, "document-table"],
  [{ name: "workpaper.DOCX" }, "document-lines"],
  [{ name: "notes.txt", type: "" }, "document-lines"],
  [{ type: "application/msword" }, "document-lines"],
  [{ name: "review.pptx" }, "presentation"],
  [{ type: "application/vnd.apple.keynote" }, "presentation"],
  [{ name: "evidence.JPEG" }, "image"],
  [{ type: "image/svg+xml; charset=utf-8" }, "image"],
  [{ name: "capture.mp4" }, "film"],
  [{ type: "video/webm" }, "film"],
  [{ name: "recording.m4a" }, "audio-wave"],
  [{ type: "audio/ogg" }, "audio-wave"],
  [{ name: "records.tar.gz" }, "document-zip"],
  [{ type: "application/vnd.rar" }, "document-zip"],
  [{ name: "data.json", type: "text/plain" }, "document-code"],
  [{ type: "application/xml" }, "document-code"],
  [{ name: "notes.unknown", type: "text/plain" }, "document-lines"],
  [{ name: "unknown.constructor", type: "application/octet-stream" }, "document"],
  [{ name: ".profile" }, "document"],
  [{ name: "no extension" }, "document"],
  [{}, "document"],
];

test("chooses an icon for common attachments, preferring the extension to MIME", () => {
  for (const [file, icon] of cases) assert.equal(getFileIconName(file), icon, JSON.stringify(file));
  assert.deepEqual(new Set(cases.map(([, icon]) => icon)), new Set(fileIconNames));
});

test("FileIcon renders the named icon with the standard SVG props", () => {
  const element = FileIcon({
    file: { name: "statement.pdf" },
    size: 20,
    className: "attachment-icon",
    "aria-label": "PDF attachment",
    role: "img",
  });
  assert.equal(element.type, DocumentPdfIcon);
  const svg = element.type(element.props);
  assert.equal(svg.type, "svg");
  assert.equal(svg.props["data-icon"], "document-pdf");
  assert.equal(svg.props.width, 20);
  assert.equal(svg.props.className, "attachment-icon");
  assert.equal(svg.props["aria-label"], "PDF attachment");
  assert.equal(svg.props["aria-hidden"], undefined);

  const fallback = FileIcon({ file: {} });
  assert.equal(fallback.type, DocumentIcon);
  const fallbackSvg = fallback.type(fallback.props);
  assert.equal(fallbackSvg.props.width, 16);
  assert.equal(fallbackSvg.props["aria-hidden"], true);
});

test("bundling FileIcon omits unrelated icons and the name-based catalog", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const result = await build({
    absWorkingDir: root,
    stdin: { contents: 'export { FileIcon } from "@booki-aui/icons/react";', resolveDir: root },
    bundle: true,
    external: ["react"],
    format: "esm",
    write: false,
    metafile: true,
  });
  const [bundle] = result.outputFiles;
  for (const name of fileIconNames) assert.ok(bundle.text.includes(JSON.stringify(name)), name);
  assert.ok(!bundle.text.includes(BanknoteIcon({}).props.dangerouslySetInnerHTML.__html));
  assert.ok(Object.values(result.metafile.outputs).every(({ inputs }) => !inputs["lib/index.js"]?.bytesInOutput));
});
