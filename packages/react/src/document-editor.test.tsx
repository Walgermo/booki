import { type EditorDocument, fromHtml, toHtml } from "@booki-aui/core/document-blocks";
import { mount } from "@ui-sdk/core/testing";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { DocumentEditor, documentEditor, type DocumentAuditEvent } from "./document-editor.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => cleanup());

type Result = { ok: boolean; value?: unknown; error?: { message: string } };

const page = (over: Partial<EditorDocument> = {}): EditorDocument => ({
  id: "05.3",
  version: 1,
  blocks: [
    { id: "b1", type: "heading", level: 2, text: "Revenue" },
    { id: "b2", type: "paragraph", text: "Sales are recognised on delivery." },
  ],
  proposals: [],
  ...over,
});

const MENTIONS = [
  { kind: "evidence" as const, id: "e12", label: "Invoice 12", hint: "2026-01-31" },
  { kind: "person" as const, id: "u1", label: "Kari Nordmann" },
];

function editor(props: Partial<React.ComponentProps<typeof DocumentEditor>> = {}) {
  const agent = createBookiAgent({ agentId: "drafter" });
  const audit: DocumentAuditEvent[] = [];
  const changes: EditorDocument[] = [];
  render(
    <BookiLocaleProvider defaultCountry="US">
      <DocumentEditor
        defaultDocument={page()}
        actor="nina"
        agentId="drafter"
        mentions={MENTIONS}
        onAudit={(row) => audit.push(row)}
        onDocumentChange={(next) => changes.push(next)}
        {...props}
      />
    </BookiLocaleProvider>,
  );
  const entry = () => agent.snapshot().find((c) => c.component === "document-editor") as unknown as Record<string, any>;
  const act = (action: string, args: unknown[] = []) =>
    agent.act({ steps: [{ ref: entry().ref, action, args }] }) as Promise<Result>;
  const button = (name: string) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === name || b.getAttribute("aria-label")?.startsWith(name),
    );
  const block = (id: string) =>
    document.querySelector<HTMLTextAreaElement>(`[data-slot="document-editor-block"][data-block="${id}"]`)!;
  return { agent, entry, act, button, block, audit, changes };
}

describe("DocumentEditor", () => {
  it("lets an agent read blocks and propose, never accept", async () => {
    const { entry, act, block } = editor();
    expect(entry().actions).toEqual([
      "findBlocks",
      "insertBlock",
      "editBlock",
      "moveBlock",
      "removeBlock",
      "runCommand",
      "withdrawProposal",
    ]);
    expect(entry().blocks.map((b: { id: string }) => b.id)).toEqual(["b1", "b2"]);
    expect(entry().insertFormat).toMatch(/insertBlock/);
    const found = await act("findBlocks", ["delivery"]);
    expect((found as any).steps[0].result).toEqual([
      { id: "b2", type: "paragraph", text: "Sales are recognised on delivery." },
    ]);

    const edit = await act("editBlock", [
      "b2",
      { text: "Revenue is recognised on delivery. @Invoice 12", mentions: ["e12"], reason: "Name the evidence" },
    ]);
    expect(edit.ok).toBe(true);
    // The page is unchanged until a person accepts.
    expect(block("b2").value).toBe("Sales are recognised on delivery.");
    expect(entry().proposals[0]).toMatchObject({
      id: expect.any(String),
      op: "edit",
      blockId: "b2",
      by: "agent:drafter",
    });
    expect(document.querySelector('[data-slot="document-editor-proposal"]')?.textContent).toMatch(/proposes a change/);

    expect((await act("accept", [entry().proposals[0].id])).ok).toBe(false);
    expect((await act("reject", [entry().proposals[0].id])).ok).toBe(false);
  });

  it("groups typing, keeps pending proposals, and audits undo and redo as new changes", async () => {
    const { act, block, button, audit, changes, entry } = editor();
    const area = block("b2");
    const original = area.value;
    expect(button("Undo")!.disabled).toBe(true);
    fireEvent.input(area, { target: { value: "First" } });
    fireEvent.input(area, { target: { value: "First draft" } });
    await act("removeBlock", ["b1"]);
    fireEvent.keyDown(area, { key: "z", metaKey: true });
    expect(area.value).toBe(original);
    expect(button("Undo")!.disabled).toBe(true);
    expect(entry().proposals).toHaveLength(1);
    fireEvent.keyDown(area, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(area.value).toBe("First draft");
    expect(audit.slice(-2).map(({ action, actor }) => [action, actor])).toEqual([
      ["undo", "nina"],
      ["redo", "nina"],
    ]);
    expect(changes.at(-1)!.version).toBe(changes.at(-2)!.version + 1);
    fireEvent.click(button("Undo")!);
    fireEvent.input(area, { target: { value: "Different draft" } });
    expect(button("Redo")!.disabled).toBe(true);
    expect((await act("restore", ["undo"])).ok).toBe(false);
  });

  it("undoes a split as one edit and invalidates history when a proposal is accepted", async () => {
    const { act, block, button, changes } = editor();
    const area = block("b2");
    const original = area.value;
    area.setSelectionRange(5, 5);
    fireEvent.keyDown(area, { key: "Enter" });
    expect(block("b3").value).toBe(original.slice(5));
    fireEvent.click(button("Undo")!);
    expect(block("b3")).toBeNull();
    expect(area.value).toBe(original);
    fireEvent.keyDown(area, { key: "y", ctrlKey: true });
    expect(changes.at(-1)!.blocks.map((b) => b.text)).toEqual(["Revenue", original.slice(0, 5), original.slice(5)]);
    await act("editBlock", ["b1", { text: "Reviewed" }]);
    fireEvent.click(button("Accept")!);
    expect(block("b1").value).toBe("Reviewed");
    expect(button("Undo")!.disabled).toBe(true);
    expect(button("Redo")!.disabled).toBe(true);
  });

  it("honors controlled document echoes, read-only mode, and external replacements", () => {
    let next = page();
    const tree = (readOnly = false) => (
      <BookiLocaleProvider defaultCountry="US">
        <DocumentEditor
          document={next}
          actor="nina"
          readOnly={readOnly}
          onDocumentChange={(doc) => {
            next = doc;
          }}
        />
      </BookiLocaleProvider>
    );
    const { rerender } = render(tree());
    const area = screen.getByRole("textbox", { name: "Text 2" });
    fireEvent.input(area, { target: { value: "Revised" } });
    rerender(tree());
    const undo = () => screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement;
    expect(undo().disabled).toBe(false);
    rerender(tree(true));
    fireEvent.keyDown(area, { key: "z", ctrlKey: true });
    expect(next.blocks[1]!.text).toBe("Revised");
    rerender(tree());
    fireEvent.click(undo());
    rerender(tree());
    expect(next.blocks).toEqual(page().blocks);
    expect((screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement).disabled).toBe(false);
    next = page({ id: "external", version: 3 });
    rerender(tree());
    expect(undo().disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Redo" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a person accepts; the change lands and both steps are audited", async () => {
    const { act, button, block, audit } = editor();
    await act("insertBlock", [{ after: "b1", type: "bullet", text: "Cut-off tested" }]);
    fireEvent.click(button("Accept")!);
    await waitFor(() => expect(document.querySelector('[data-block="b3"]')).not.toBeNull());
    expect(block("b3").value).toBe("Cut-off tested");
    expect(audit.map((row) => [row.action, row.actor])).toEqual([
      ["propose-insert", "agent:drafter"],
      ["accept", "nina"],
    ]);
    expect(audit[1]).toMatchObject({ outcome: "accepted", proposalId: audit[0]!.proposalId, version: 2 });
  });

  it("refuses a stale accept and lets the person reject", async () => {
    const { act, button, block, audit } = editor();
    await act("editBlock", ["b2", { text: "Agent text" }]);
    fireEvent.input(block("b2"), { target: { value: "A person wrote this.", selectionStart: 5 } });
    fireEvent.click(button("Accept")!);
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/changed after proposal/);
    fireEvent.click(button("Reject")!);
    await waitFor(() => expect(document.querySelector('[data-slot="document-editor-proposal"]')).toBeNull());
    expect(block("b2").value).toBe("A person wrote this.");
    expect(audit.at(-1)).toMatchObject({ action: "reject", outcome: "rejected", actor: "nina" });
  });

  it("runs a slash command as a proposal, and refuses the app's own for an agent", async () => {
    const { act, entry } = editor({
      commands: [
        { id: "heading2", label: "Heading 2", type: "heading", level: 2 },
        { id: "upload", label: "Upload a file" },
      ],
    });
    const ran = await act("runCommand", ["heading2", { block: "b2" }]);
    expect(ran.ok).toBe(true);
    expect(entry().proposals[0]).toMatchObject({ op: "edit", type: "heading" });
    const refused = await act("runCommand", ["upload", { block: "b1" }]);
    expect(refused.ok).toBe(false);
    expect(refused.error?.message).toMatch(/An agent can run: heading2/);
  });

  it("withdraws its own proposal; one pending per page when asked", async () => {
    const { act, entry } = editor({ onePending: true });
    await act("removeBlock", ["b2"]);
    const second = await act("removeBlock", ["b1"]);
    expect(second.error?.message).toMatch(/waits for a person/);
    expect((await act("withdrawProposal", [entry().proposals[0].id])).ok).toBe(true);
    expect(entry().proposals).toEqual([]);
  });

  it("lets the app store proposals: onProposalsChange out, proposals back in", async () => {
    const stored: unknown[][] = [];
    const { act, entry } = editor({ onProposalsChange: (list) => stored.push(list) });
    await act("removeBlock", ["b2", { reason: "Duplicate" }]);
    const proposalId = entry().proposals[0].id;
    expect(stored.at(-1)).toMatchObject([{ id: proposalId, op: "remove", blockId: "b2", reason: "Duplicate" }]);
    cleanup();
    // A new page load: the stored proposal comes back and still waits for a person.
    const again = editor({ proposals: stored.at(-1) as never });
    expect(again.entry().proposals).toMatchObject([{ id: proposalId, op: "remove" }]);
    expect(document.querySelector('[data-slot="document-editor-proposal"]')).not.toBeNull();
  });

  it("refuses proposals on a read-only page", async () => {
    const { act } = editor({ readOnly: true });
    const result = await act("insertBlock", [{ after: null, text: "x" }]);
    expect(result.error?.message).toMatch(/read-only/);
  });

  it("'/' opens commands and Enter turns the block", async () => {
    const { block, changes } = editor();
    const area = block("b2");
    area.focus();
    expect(area.hasAttribute("aria-expanded")).toBe(false);
    expect(area.hasAttribute("aria-controls")).toBe(false);
    fireEvent.input(area, { target: { value: "/head", selectionStart: 5, selectionEnd: 5 } });
    const menu = document.querySelector('[data-slot="document-editor-menu"]');
    expect(menu?.textContent).toMatch(/Heading 1/);
    expect(area.hasAttribute("aria-expanded")).toBe(false);
    expect(area.getAttribute("aria-haspopup")).toBe("listbox");
    expect(area.getAttribute("aria-controls")).toBe(menu?.id);
    const activeId = area.getAttribute("aria-activedescendant")!;
    expect(menu?.contains(document.getElementById(activeId))).toBe(true);
    fireEvent.keyDown(area, { key: "ArrowDown" });
    fireEvent.keyDown(area, { key: "Enter" });
    expect(area.hasAttribute("aria-controls")).toBe(false);
    expect(area.hasAttribute("aria-activedescendant")).toBe(false);
    expect(changes.at(-1)?.blocks[1]).toMatchObject({ id: "b2", type: "heading", level: 2, text: "" });
  });

  it("'@' mentions evidence from the app's list", () => {
    const { block, changes, audit } = editor();
    const area = block("b2");
    area.focus();
    fireEvent.input(area, { target: { value: "See @inv", selectionStart: 8, selectionEnd: 8 } });
    expect(document.querySelector('[data-slot="document-editor-menu"]')?.textContent).toMatch(/Invoice 12/);
    fireEvent.keyDown(area, { key: "Enter" });
    expect(changes.at(-1)?.blocks[1]).toMatchObject({
      text: "See @Invoice 12 ",
      refs: [{ kind: "evidence", id: "e12", label: "Invoice 12" }],
    });
    expect(audit.at(-1)).toMatchObject({ action: "mention", detail: "evidence e12" });
  });

  it("lets a person focus the command list, navigate it, and cancel at the original caret", () => {
    const { block, changes } = editor();
    const area = block("b2");
    area.focus();
    fireEvent.input(area, { target: { value: "/ remaining text", selectionStart: 1, selectionEnd: 1 } });
    const list = screen.getByRole("listbox", { name: "Commands" });
    expect(list.tabIndex).toBe(0);
    fireEvent.keyDown(area, { key: "ArrowDown", altKey: true });
    expect(document.activeElement).toBe(list);
    const options = screen.getAllByRole("option");
    for (const [key, index] of [
      ["End", -1],
      ["ArrowDown", 0],
      ["ArrowUp", -1],
      ["Home", 0],
    ] as const) {
      fireEvent.keyDown(list, { key });
      const option = options.at(index)!;
      expect(list.getAttribute("aria-activedescendant")).toBe(option.id);
      expect(area.getAttribute("aria-activedescendant")).toBe(option.id);
      expect(screen.getByRole("option", { selected: true })).toBe(option);
    }
    fireEvent.keyDown(list, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(area);
    expect(area.selectionStart).toBe(1);
    expect(changes.at(-1)?.blocks[1]?.text).toBe("/ remaining text");
  });

  it("selects a mention from the focused list and returns to the edited block", () => {
    const { block, changes } = editor();
    const area = block("b2");
    area.focus();
    fireEvent.input(area, { target: { value: "See @", selectionStart: 5 } });
    const list = screen.getByRole("listbox", { name: "Mentions" });
    fireEvent.keyDown(area, { key: "ArrowDown", altKey: true });
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(area);
    expect(changes.at(-1)?.blocks[1]?.text).toBe("See @Kari Nordmann ");
  });

  it("audits a single edit when focus leaves the list for another block", () => {
    const { block, audit } = editor();
    const area = block("b2");
    area.focus();
    fireEvent.input(area, { target: { value: "/head", selectionStart: 5 } });
    fireEvent.keyDown(area, { key: "ArrowDown", altKey: true });
    expect(audit.filter((row) => row.action === "edit-text")).toHaveLength(0);
    const list = screen.getByRole("listbox");
    expect(fireEvent.keyDown(list, { key: "Tab" })).toBe(true);
    fireEvent.blur(list, { relatedTarget: block("b1") });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(audit.filter((row) => row.action === "edit-text")).toHaveLength(1);
  });

  it("clears the callout classification when Backspace turns it into a paragraph", () => {
    const blocks = fromHtml(
      '<aside data-block-id="risk" data-callout="warning" data-origin="person"><p>Risk</p></aside>',
    );
    const { block, changes } = editor({ defaultDocument: page({ blocks }) });
    const area = block("risk");
    area.focus();
    area.setSelectionRange(0, 0);
    fireEvent.keyDown(area, { key: "Backspace" });
    const saved = new DOMParser().parseFromString(toHtml(changes.at(-1)!.blocks), "text/html");
    const paragraph = saved.querySelector('p[data-block-id="risk"]');
    expect(paragraph?.getAttribute("data-origin")).toBe("person");
    expect(paragraph?.hasAttribute("data-callout")).toBe(false);
  });

  it("Enter splits a block and the edit is audited once on blur", () => {
    const { block, changes, audit } = editor();
    const area = block("b2");
    area.focus();
    area.setSelectionRange(5, 5);
    fireEvent.keyDown(area, { key: "Enter" });
    expect(changes.at(-1)?.blocks.map((b) => b.text)).toEqual(["Revenue", "Sales", " are recognised on delivery."]);
    fireEvent.blur(area);
    expect(audit.filter((row) => row.action === "edit-text")).toHaveLength(1);
  });

  it("speaks Norwegian on a Norwegian screen", async () => {
    const agent = createBookiAgent({ agentId: "drafter" });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <DocumentEditor defaultDocument={page()} actor="nina" />
      </BookiLocaleProvider>,
    );
    const ref = (agent.snapshot().find((c) => c.component === "document-editor") as any).ref;
    await agent.act({ steps: [{ ref, action: "removeBlock", args: ["b2"] }] });
    expect(document.body.textContent).toMatch(/foreslår å fjerne dette/);
    expect(document.body.textContent).toMatch(/Godta/);
  });
});

describe("documentEditor (ui-sdk mount)", () => {
  it("keeps the undo entry when the app cancels a change", () => {
    const initial = page();
    let cancel = false;
    const view = mount(
      documentEditor,
      {
        defaultDocument: initial,
        actor: "nina",
        onDocumentChange: (_next, details) => {
          if (cancel) details.cancel?.();
        },
      },
      "<root></root>",
    );
    try {
      view.api.typed("b2", "Local", 5);
      cancel = true;
      expect(view.api.restore("undo")).toBe(false);
      expect(view.state.canUndo).toBe(true);
      expect(view.state.document.blocks[1]!.text).toBe("Local");
      cancel = false;
      expect(view.api.restore("undo")).toBe(true);
      expect(view.state.document.blocks).toEqual(initial.blocks);
    } finally {
      view.unmount();
    }
  });

  it("reports a person's accept with its real source", async () => {
    const withProposal = page({
      proposals: [
        {
          id: "p1",
          op: "remove",
          blockId: "b2",
          before: { id: "b2", type: "paragraph", text: "Sales are recognised on delivery." },
          by: "agent:x",
          at: "2026-11-26T10:00:00Z",
        },
      ],
    });
    const view = mount(
      documentEditor,
      { defaultDocument: withProposal, actor: "nina" },
      `<root><accept value="p1#accept">Accept</accept></root>`,
    );
    try {
      await view.click(view.part("accept", "p1#accept")!);
      expect(view.changes.at(-1)).toMatchObject({ key: "document", reason: "accept", source: "mouse" });
    } finally {
      view.unmount();
    }
  });

  it("a proposal changes only the proposals, never the blocks", async () => {
    const view = mount(documentEditor, { defaultDocument: page(), actor: "nina" }, `<root></root>`);
    try {
      view.api.insertBlock({ after: "b2", text: "New" });
      expect(view.changes.at(-1)).toMatchObject({ key: "document", reason: "propose-insert" });
      expect(view.state.document.blocks).toHaveLength(2);
    } finally {
      view.unmount();
    }
  });
});
