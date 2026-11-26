import { describe, expect, it } from "vitest";
import {
  acceptProposal,
  documentText,
  dropProposal,
  findBlocks,
  fromTiptap,
  patchBlock,
  proposeEdit,
  proposeInsert,
  proposeMove,
  proposeRemove,
  setBlocks,
  toTiptap,
  type EditorDocument,
} from "./document-blocks.js";

const doc: EditorDocument = {
  id: "page-1",
  version: 3,
  blocks: [
    { id: "b1", type: "heading", level: 1, text: "Revenue" },
    { id: "b2", type: "paragraph", text: "Sales are recognised on delivery." },
    { id: "b3", type: "bullet", text: "Cut-off tested" },
  ],
  proposals: [],
};
const by = { by: "agent", at: "2026-11-26T10:00:00Z" };

describe("document blocks", () => {
  it("an insert waits, then lands where it was proposed", () => {
    const { document, proposal } = proposeInsert(doc, { after: "b1", block: { type: "paragraph", text: "Scope" } }, by);
    expect(document.blocks).toHaveLength(3);
    expect(proposal).toMatchObject({ op: "insert", blockId: "b4", after: "b1" });
    const accepted = acceptProposal(document, proposal.id);
    expect(accepted.blocks.map((block) => block.id)).toEqual(["b1", "b4", "b2", "b3"]);
    expect(accepted.version).toBe(4);
    expect(accepted.proposals).toEqual([]);
  });

  it("an edit is refused when a person changed the block after it was proposed", () => {
    const { document, proposal } = proposeEdit(doc, "b2", { ...doc.blocks[1]!, text: "Revenue on delivery." }, by);
    const changed = setBlocks(
      document,
      document.blocks.map((block) => (block.id === "b2" ? { ...block, text: "A person wrote this." } : block)),
    );
    expect(() => acceptProposal(changed, proposal.id)).toThrow(/changed after proposal/);
    expect(dropProposal(changed, proposal.id).proposals).toEqual([]);
  });

  it("moves, removes, and refuses a second proposal on one block", () => {
    const moved = proposeMove(doc, "b3", null, by);
    expect(acceptProposal(moved.document, moved.proposal.id).blocks.map((block) => block.id)).toEqual([
      "b3",
      "b1",
      "b2",
    ]);
    expect(() => proposeRemove(moved.document, "b3", by)).toThrow(/already has proposal/);
    const removed = proposeRemove(doc, "b2", by);
    expect(acceptProposal(removed.document, removed.proposal.id).blocks.map((block) => block.id)).toEqual(["b1", "b3"]);
  });

  it("keeps proposal identities unique across decisions, reloads and concurrent drafts", () => {
    const insert = (page: EditorDocument) => proposeInsert(page, { block: { type: "paragraph", text: "Scope" } }, by);
    const first = insert(doc);
    const concurrent = insert(doc);
    const accepted = acceptProposal(first.document, first.proposal.id);
    const second = insert(JSON.parse(JSON.stringify(accepted)));
    const dropped = dropProposal(second.document, second.proposal.id);
    const third = insert(dropped);
    expect(new Set([first, concurrent, second, third].map((result) => result.proposal.id)).size).toBe(4);
    expect(accepted.blocks[0]?.origin?.proposal).toBe(first.proposal.id);
    expect(() => acceptProposal(third.document, second.proposal.id)).toThrow(/No proposal/);
  });

  it("one pending proposal per page when asked", () => {
    const first = proposeRemove(doc, "b2", { ...by, onePending: true });
    expect(() => proposeRemove(first.document, "b3", { ...by, onePending: true })).toThrow(/waits for a person/);
  });

  it("unknown ids list the ones that exist", () => {
    expect(() => proposeRemove(doc, "b9", by)).toThrow(/Blocks: b1, b2, b3/);
    expect(() => acceptProposal(doc, "p9")).toThrow(/Proposals: none/);
    expect(() => patchBlock(doc.blocks[1]!, { mentions: ["x"] }, [])).toThrow(/Mentions: none/);
  });

  it("mentions take their label from the app's list", () => {
    const block = patchBlock(doc.blocks[1]!, { mentions: ["e12"] }, [
      { kind: "evidence", id: "e12", label: "Invoice 12" },
    ]);
    expect(block.text).toBe("Sales are recognised on delivery. @Invoice 12");
    expect(block.refs).toEqual([{ kind: "evidence", id: "e12", label: "Invoice 12" }]);
  });

  it("finds blocks and reads the page as text", () => {
    expect(findBlocks(doc, "cut-off").map((block) => block.id)).toEqual(["b3"]);
    expect(documentText(doc)).toBe("# Revenue\nSales are recognised on delivery.\n- Cut-off tested");
  });

  it("round-trips TipTap JSON with ids and mentions", () => {
    const blocks = [
      ...doc.blocks,
      {
        id: "b4",
        type: "todo" as const,
        text: "Ask @Kari",
        checked: true,
        refs: [{ kind: "person" as const, id: "u1", label: "Kari" }],
      },
    ];
    const json = toTiptap(blocks);
    expect(json.content?.map((node) => node.type)).toEqual(["heading", "paragraph", "bulletList", "taskList"]);
    expect(fromTiptap(json)).toEqual(blocks);
  });
});
