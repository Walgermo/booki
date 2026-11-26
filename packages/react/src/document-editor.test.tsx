import type { EditorDocument } from "@booki-aui/core/document-blocks";
import { mount } from "@ui-sdk/core/testing";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
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
    expect(entry().proposals[0]).toMatchObject({ id: "p1", op: "edit", blockId: "b2", by: "agent:drafter" });
    expect(document.querySelector('[data-slot="document-editor-proposal"]')?.textContent).toMatch(/proposes a change/);

    expect((await act("accept", ["p1"])).ok).toBe(false);
    expect((await act("reject", ["p1"])).ok).toBe(false);
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
    expect(audit[1]).toMatchObject({ outcome: "accepted", proposalId: "p1", version: 2 });
  });

  it("refuses a stale accept and lets the person reject", async () => {
    const { act, button, block, audit } = editor();
    await act("editBlock", ["b2", { text: "Agent text" }]);
    fireEvent.input(block("b2"), { target: { value: "A person wrote this.", selectionStart: 5 } });
    fireEvent.click(button("Accept")!);
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/changed after proposal p1/);
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
    expect((await act("withdrawProposal", ["p1"])).ok).toBe(true);
    expect(entry().proposals).toEqual([]);
  });

  it("lets the app store proposals: onProposalsChange out, proposals back in", async () => {
    const stored: unknown[][] = [];
    const { act, entry } = editor({ onProposalsChange: (list) => stored.push(list) });
    await act("removeBlock", ["b2", { reason: "Duplicate" }]);
    expect(stored.at(-1)).toMatchObject([{ id: "p1", op: "remove", blockId: "b2", reason: "Duplicate" }]);
    cleanup();
    // A new page load: the stored proposal comes back and still waits for a person.
    const again = editor({ proposals: stored.at(-1) as never });
    expect(again.entry().proposals).toMatchObject([{ id: "p1", op: "remove" }]);
    expect(document.querySelector('[data-slot="document-editor-proposal"]')).not.toBeNull();
    void entry;
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
    fireEvent.input(area, { target: { value: "/head", selectionStart: 5, selectionEnd: 5 } });
    const menu = document.querySelector('[data-slot="document-editor-menu"]');
    expect(menu?.textContent).toMatch(/Heading 1/);
    expect(area.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(area, { key: "ArrowDown" });
    fireEvent.keyDown(area, { key: "Enter" });
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
