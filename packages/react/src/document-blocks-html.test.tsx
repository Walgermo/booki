import { acceptProposal, fromHtml, proposeEdit, toHtml } from "@booki-aui/core/document-blocks";
import { describe, expect, it } from "vitest";

// An app page as a ProseMirror editor stores it: ids and an origin on each top-level node, a table, an attachment chip.
const PAGE = [
  '<h2 data-node-id="01A" data-origin="{&quot;type&quot;:&quot;person&quot;}">Revenue</h2>',
  '<p data-node-id="01B">Sales on <strong>delivery</strong>.<br>Second line</p>',
  '<ul data-node-id="01C"><li><p>One</p></li><li><p>Two</p></li></ul>',
  '<p data-node-id="01D">See <span data-attachment-id="77" data-file-name="sample.xlsx">sample.xlsx</span> here</p>',
  '<table data-node-id="01E"><tbody><tr><td>1500</td><td>12 000</td></tr></tbody></table>',
  '<p data-node-id="01F">Total <span data-field="sum">12 000</span></p>',
].join("");

const options = {
  idAttr: "data-node-id",
  mentionFrom: (element: Element) =>
    element.hasAttribute("data-attachment-id")
      ? {
          kind: "file" as const,
          id: element.getAttribute("data-attachment-id")!,
          label: element.getAttribute("data-file-name")!,
        }
      : null,
  mentionHtml: (ref: { id: string; label: string }) =>
    `<span data-attachment-id="${ref.id}" data-file-name="${ref.label}">${ref.label}</span>`,
};

describe("document blocks from and to HTML", () => {
  it("reads blocks, keeps attributes, and keeps what it cannot edit as an embed", () => {
    const blocks = fromHtml(PAGE, options);
    expect(blocks.map((block) => [block.id, block.type])).toEqual([
      ["01A", "heading"],
      ["01B", "paragraph"],
      ["01C", "bullet"],
      ["b4", "bullet"],
      ["01D", "paragraph"],
      ["01E", "embed"],
      ["01F", "embed"],
    ]);
    expect(blocks[0]!.attrs).toEqual({ "data-origin": '{"type":"person"}' });
    expect(blocks[1]!.text).toBe("Sales on **delivery**.\nSecond line");
    expect(blocks[4]).toMatchObject({
      text: "See @sample.xlsx here",
      refs: [{ kind: "file", id: "77", label: "sample.xlsx" }],
    });
    expect(blocks[5]!.text).toBe("1500 12 000");
  });

  it("writes back what it read: attributes, mentions and embeds unchanged", () => {
    const html = toHtml(fromHtml(PAGE, options), options);
    expect(html).toContain('<h2 data-origin="{&quot;type&quot;:&quot;person&quot;}" data-node-id="01A">Revenue</h2>');
    expect(html).toContain('<ul data-node-id="01C"><li><p>One</p></li><li data-node-id="b4"><p>Two</p></li></ul>');
    expect(html).toContain('See <span data-attachment-id="77" data-file-name="sample.xlsx">sample.xlsx</span> here');
    expect(html).toContain('<table data-node-id="01E"><tbody><tr><td>1500</td><td>12 000</td></tr></tbody></table>');
    expect(fromHtml(html, options)).toEqual(fromHtml(PAGE, options));
  });

  it("preserves a warning callout's classification when saving its HTML", () => {
    const html = '<aside data-block-id="risk" data-callout="warning"><p>Review the estimate</p></aside>';
    const blocks = fromHtml(html);
    const saved = new DOMParser().parseFromString(toHtml(blocks), "text/html");
    expect(saved.querySelector('aside[data-block-id="risk"]')?.getAttribute("data-callout")).toBe("warning");
    expect(blocks[0]).toMatchObject({ type: "callout", calloutKind: "warning" });
  });

  it.each(["bullet", "numbered", "todo"] as const)("preserves editable callouts and %s item identities", (type) => {
    const items = ["e-a", "e-b", "e-c"].map((id, i) => ({
      id,
      type,
      text: id,
      ...(type === "todo" ? { checked: i === 1 } : {}),
    }));
    const blocks = [{ id: "scope", type: "callout" as const, text: "Review" }, ...items];
    expect(fromHtml(toHtml(blocks, options), options)).toEqual(blocks);
  });

  it("keeps bold, italics, code and links through an edit, as inline markdown", () => {
    const html =
      '<p data-node-id="x">A <em>very</em> <a href="https://example.test/a">safe link</a>, <code>1500</code> and <a href="javascript:x">bad</a></p>';
    const [block] = fromHtml(html, options);
    expect(block!.text).toBe("A *very* [safe link](https://example.test/a), `1500` and bad");
    const edited = { ...block!, text: `${block!.text} **now**` };
    expect(toHtml([edited], options)).toBe(
      '<p data-node-id="x">A <em>very</em> <a href="https://example.test/a">safe link</a>, <code>1500</code> and bad <strong>now</strong></p>',
    );
    expect(fromHtml(html, { ...options, formatted: "flatten" })[0]!.text).toBe("A very safe link, 1500 and bad");
  });

  it("keeps formatting by making the block an embed when asked", () => {
    expect(fromHtml(PAGE, { ...options, formatted: "embed" })[1]!.type).toBe("embed");
  });

  it("refuses an agent's edit of an embed, and marks an accepted block with its origin", () => {
    const doc = { id: "p", version: 1, blocks: fromHtml(PAGE, options), proposals: [] };
    const embed = doc.blocks[5]!;
    expect(() =>
      proposeEdit(doc, embed.id, { ...embed, type: "paragraph", text: "x" }, { by: "agent", at: "t" }),
    ).toThrow(/changed where it comes from/);
    const { document, proposal } = proposeEdit(
      doc,
      "01B",
      { ...doc.blocks[1]!, text: "New" },
      { by: "agent:drafter", at: "t" },
    );
    expect(acceptProposal(document, proposal.id).blocks[1]).toMatchObject({
      text: "New",
      origin: { by: "agent:drafter", proposal: proposal.id },
    });
  });
});
