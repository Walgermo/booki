import type { DocBlock, EditorDocument } from "@booki-aui/core/document-blocks";

type Entry = { before: DocBlock[]; after: DocBlock[] };
export type HistoryAction = "undo" | "redo";

/** Local block edits only. Proposals and document versions always come from the live document. */
export class DocumentEditHistory {
  private entries: Entry[] = [];
  private position = 0;
  private expected?: EditorDocument;
  private typing?: { block: string; at: number };

  get availability() {
    return { canUndo: this.position > 0, canRedo: this.position < this.entries.length };
  }

  endTyping() {
    this.typing = undefined;
  }

  reset() {
    this.entries = [];
    this.position = 0;
    this.expected = undefined;
    this.endTyping();
  }

  sync(doc: EditorDocument) {
    const last = this.expected;
    if (!last) return;
    if (
      last.id !== doc.id ||
      last.version !== doc.version ||
      (last.blocks !== doc.blocks && JSON.stringify(last.blocks) !== JSON.stringify(doc.blocks))
    )
      this.reset();
  }

  record(before: EditorDocument, after: EditorDocument, typedBlock?: string) {
    this.sync(before);
    const at = Date.now();
    if (typedBlock && this.typing?.block === typedBlock && at - this.typing.at < 1000) {
      this.entries[this.position - 1]!.after = after.blocks;
    } else {
      this.entries.splice(this.position);
      this.entries.push({ before: before.blocks, after: after.blocks });
      if (this.entries.length > 100) this.entries.shift();
      this.position = this.entries.length;
    }
    this.typing = typedBlock ? { block: typedBlock, at } : undefined;
    this.expected = after;
  }

  target(action: HistoryAction) {
    return action === "undo" ? this.entries[this.position - 1]?.before : this.entries[this.position]?.after;
  }

  restored(action: HistoryAction, next: EditorDocument) {
    this.position += action === "undo" ? -1 : 1;
    this.expected = next;
    this.endTyping();
  }
}
