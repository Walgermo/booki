import { BookiError } from "./msg.js";

/**
 * A working paper as blocks: the model behind `DocumentEditor`. Pure and
 * framework-free, so the app's server can apply the same proposal rules.
 *
 * A person edits blocks directly. Everything an agent does is a proposal that
 * waits until a person accepts or rejects it: insert, edit, move, remove. An
 * edit or a move remembers the block as the agent saw it; if a person changed
 * the block since, accepting is refused (`doc.proposal-stale`) and the person
 * rejects it, so a proposal never overwrites work the agent did not see.
 */

export type BlockType =
  | "paragraph"
  | "heading"
  | "bullet"
  | "numbered"
  | "todo"
  | "quote"
  | "callout"
  | "divider"
  | "embed";

export const BLOCK_TYPES: readonly BlockType[] = [
  "paragraph",
  "heading",
  "bullet",
  "numbered",
  "todo",
  "quote",
  "callout",
  "divider",
  "embed",
];

/** Types an agent or a person can create. `embed` only comes from the app's content (a table, a data node). */
export const EDITABLE_TYPES: readonly BlockType[] = BLOCK_TYPES.filter((type) => type !== "embed");

/** What an `@` mention points at. The app passes the list; the editor never invents one. */
export type MentionKind = "file" | "evidence" | "person" | "page";

export const MENTION_KINDS: readonly MentionKind[] = ["file", "evidence", "person", "page"];

export type Mention = {
  kind: MentionKind;
  id: string;
  /** What the person reads, and what follows `@` in the text. */
  label: string;
  /** A second line in the menu, such as a file's date or a person's role. */
  hint?: string;
};

/** A mention in a block: the item's id, kind and label as it was when it was mentioned. */
export type BlockRef = { kind: MentionKind; id: string; label: string };

export type DocBlock = {
  id: string;
  type: BlockType;
  /** Plain text. A mention reads "@Label" in it, and is listed in `refs`. */
  text: string;
  /** Heading level, 1 to 3. Headings only. */
  level?: 1 | 2 | 3;
  /** Todo only. */
  checked?: boolean;
  refs?: BlockRef[];
  /** Who wrote it, when an agent's proposal put it there; cleared when a person changes the block. */
  origin?: { by: string; proposal: string };
  /** Embed only: the app's own markup, kept as it came (a table, a figure, a data node). `text` is its words. */
  raw?: string;
  /** The block element's other attributes from the app's markup (e.g. data-origin), written back as they came. */
  attrs?: Record<string, string>;
};

export type ProposalOp = "insert" | "edit" | "move" | "remove";

export type DocProposal = {
  id: string;
  op: ProposalOp;
  /** The block it changes; for an insert, the new block's id. */
  blockId: string;
  /** Insert and move: the block it goes after, or null for the top. */
  after?: string | null;
  /** Edit: the block as it will be. */
  block?: DocBlock;
  /** Insert: the new blocks, in order. The first one's id is `blockId`. */
  blocks?: DocBlock[];
  /** Edit, move and remove: the block as the agent saw it. */
  before?: DocBlock;
  /** Why, in the agent's words. Shown to the person. */
  reason?: string;
  /** Who proposed it, e.g. "agent" or "agent:drafter". */
  by: string;
  /** ISO timestamp. */
  at: string;
};

export type EditorDocument = {
  id: string;
  /** Bumped on every change a person makes or accepts. */
  version: number;
  blocks: DocBlock[];
  /** Proposals that wait for a person. Accepted and rejected ones leave the list. */
  proposals: DocProposal[];
};

/** What happened to a proposal, for the app's audit trail. */
export type ProposalOutcome = "accepted" | "rejected" | "withdrawn";

export const EMPTY_DOCUMENT: EditorDocument = { id: "", version: 0, blocks: [], proposals: [] };

/** The fields an agent may set on a block. */
export type BlockPatch = {
  type?: BlockType;
  text?: string;
  level?: 1 | 2 | 3;
  checked?: boolean;
  /** Ids of mentions from the app's list. The labels come from the list. */
  mentions?: string[];
};

const ids = (list: { id: string }[]) => list.map((item) => item.id).join(", ") || "none";

export function findBlock(document: EditorDocument, id: string): DocBlock {
  const block = document.blocks.find((item) => item.id === String(id));
  if (!block) throw new BookiError("doc.no-block", { id: String(id), ids: ids(document.blocks) });
  return block;
}

export function findProposal(document: EditorDocument, id: string): DocProposal {
  const proposal = document.proposals.find((item) => item.id === String(id));
  if (!proposal) throw new BookiError("doc.no-proposal", { id: String(id), ids: ids(document.proposals) });
  return proposal;
}

/** The next free id with a prefix: b1, b2 … or p1, p2 … */
export function nextId(prefix: string, taken: { id: string }[]): string {
  const used = new Set(taken.map((item) => item.id));
  let n = taken.length + 1;
  while (used.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

const allIds = (document: EditorDocument) => [
  ...document.blocks,
  ...document.proposals.flatMap((item) => item.blocks ?? []),
];

export function newBlockId(document: EditorDocument): string {
  return nextId("b", allIds(document));
}

function assertType(type: unknown): BlockType {
  if (!BLOCK_TYPES.includes(type as BlockType)) {
    throw new BookiError("doc.unknown-type", { type: String(type), types: EDITABLE_TYPES.join(", ") });
  }
  return type as BlockType;
}

/** Normalise a block: a heading has a level, only a todo has `checked`, a divider has no text. */
export function cleanBlock(block: DocBlock): DocBlock {
  const type = assertType(block.type);
  const out: DocBlock = { id: String(block.id), type, text: type === "divider" ? "" : String(block.text ?? "") };
  if (type === "embed" && block.raw !== undefined) out.raw = String(block.raw);
  if (block.origin) out.origin = { by: String(block.origin.by), proposal: String(block.origin.proposal) };
  if (block.attrs && Object.keys(block.attrs).length) out.attrs = { ...block.attrs };
  if (type === "heading") {
    const level = Number(block.level ?? 2);
    if (![1, 2, 3].includes(level)) throw new BookiError("doc.heading-level", { level: String(block.level) });
    out.level = level as 1 | 2 | 3;
  }
  if (type === "todo") out.checked = Boolean(block.checked);
  if (block.refs?.length) {
    // A ref whose "@Label" left the text goes with it.
    const refs = block.refs.filter((ref) => out.text.includes(`@${ref.label}`));
    if (refs.length) out.refs = refs;
  }
  return out;
}

/** Apply a patch, reading mention labels from the app's list. */
export function patchBlock(block: DocBlock, patch: BlockPatch, mentions: Mention[] = []): DocBlock {
  if (block.type === "embed") throw new BookiError("doc.embed-fixed", { id: block.id });
  const next: DocBlock = { ...block };
  if (patch.type !== undefined) {
    next.type = assertType(patch.type);
    if (next.type === "embed") throw new BookiError("doc.embed-new", { types: EDITABLE_TYPES.join(", ") });
  }
  if (patch.text !== undefined) next.text = String(patch.text);
  if (patch.level !== undefined) next.level = patch.level;
  if (patch.checked !== undefined) next.checked = Boolean(patch.checked);
  if (patch.mentions !== undefined) {
    if (!Array.isArray(patch.mentions)) {
      throw new BookiError("doc.mentions-list", { got: typeof patch.mentions });
    }
    const refs = patch.mentions.map((id) => {
      const item = mentions.find((mention) => mention.id === String(id));
      if (!item) throw new BookiError("doc.no-mention", { id: String(id), ids: ids(mentions) });
      return { kind: item.kind, id: item.id, label: item.label };
    });
    // A mention the text does not name yet is added at the end, so the reader sees it.
    for (const ref of refs) if (!next.text.includes(`@${ref.label}`)) next.text = `${next.text} @${ref.label}`.trim();
    next.refs = [...(block.refs ?? []).filter((ref) => !refs.some((item) => item.id === ref.id)), ...refs];
  }
  return cleanBlock(next);
}

const sameBlock = (a: DocBlock | undefined, b: DocBlock | undefined) =>
  JSON.stringify(a && cleanBlock(a)) === JSON.stringify(b && cleanBlock(b));

function assertAfter(document: EditorDocument, after: unknown): string | null {
  if (after === null || after === undefined || after === "") return null;
  return findBlock(document, String(after)).id;
}

function insertAfter(blocks: DocBlock[], added: DocBlock[], after: string | null): DocBlock[] {
  if (after === null) return [...added, ...blocks];
  const at = blocks.findIndex((item) => item.id === after);
  // The block it was to follow is gone: they go last, rather than nowhere.
  if (at < 0) return [...blocks, ...added];
  return [...blocks.slice(0, at + 1), ...added, ...blocks.slice(at + 1)];
}

type ProposeOptions = { by: string; at: string; reason?: string; onePending?: boolean };

function propose(document: EditorDocument, proposal: Omit<DocProposal, "id" | "by" | "at">, options: ProposeOptions) {
  if (options.onePending && document.proposals.length > 0) {
    throw new BookiError("doc.proposal-waiting", { id: document.proposals[0]!.id });
  }
  const pending = document.proposals.find((item) => item.blockId === proposal.blockId && item.op !== "insert");
  if (pending && proposal.op !== "insert") {
    throw new BookiError("doc.block-has-proposal", { id: proposal.blockId, proposal: pending.id });
  }
  const reason = options.reason?.trim();
  const next: DocProposal = {
    id: nextId("p", document.proposals),
    ...proposal,
    ...(reason ? { reason } : {}),
    by: options.by,
    at: options.at,
  };
  return { document: { ...document, proposals: [...document.proposals, next] }, proposal: next };
}

type NewBlock = Omit<DocBlock, "id"> & { id?: string };

/** Propose one block, or several in order (a template), after a block or at the top. */
export function proposeInsert(
  document: EditorDocument,
  input: { after?: string | null; block?: NewBlock; blocks?: NewBlock[] },
  options: ProposeOptions,
) {
  const after = assertAfter(document, input.after);
  const wanted = input.blocks ?? (input.block ? [input.block] : []);
  if (wanted.length === 0) throw new BookiError("doc.nothing-to-insert", {});
  const blocks: DocBlock[] = [];
  for (const block of wanted) {
    if (block.type === "embed") throw new BookiError("doc.embed-new", { types: EDITABLE_TYPES.join(", ") });
    const taken = { ...document, blocks: [...document.blocks, ...blocks] };
    blocks.push(cleanBlock({ ...block, id: block.id ?? newBlockId(taken) } as DocBlock));
  }
  return propose(document, { op: "insert", blockId: blocks[0]!.id, after, blocks }, options);
}

export function proposeEdit(document: EditorDocument, id: string, block: DocBlock, options: ProposeOptions) {
  const before = findBlock(document, id);
  if (before.type === "embed") throw new BookiError("doc.embed-fixed", { id: before.id });
  const next = cleanBlock({ ...block, id: before.id });
  if (sameBlock(before, next)) throw new BookiError("doc.no-change", { id: before.id });
  return propose(document, { op: "edit", blockId: before.id, block: next, before }, options);
}

export function proposeMove(document: EditorDocument, id: string, after: string | null, options: ProposeOptions) {
  const before = findBlock(document, id);
  const target = assertAfter(document, after);
  if (target === before.id) throw new BookiError("doc.move-self", { id: before.id });
  const index = document.blocks.findIndex((item) => item.id === before.id);
  const current = index === 0 ? null : document.blocks[index - 1]!.id;
  if (current === target) throw new BookiError("doc.no-change", { id: before.id });
  return propose(document, { op: "move", blockId: before.id, after: target, before }, options);
}

export function proposeRemove(document: EditorDocument, id: string, options: ProposeOptions) {
  const before = findBlock(document, id);
  return propose(document, { op: "remove", blockId: before.id, before }, options);
}

const bump = (document: EditorDocument, blocks: DocBlock[], proposals: DocProposal[]): EditorDocument => ({
  ...document,
  version: document.version + 1,
  blocks,
  proposals,
});

/**
 * Accept a proposal: the change lands, the version goes up, the proposal leaves
 * the list. Refused when the block changed since the agent saw it, or is gone.
 * Accepting is a person's decision; the caller checks who it is.
 */
export function acceptProposal(document: EditorDocument, id: string): EditorDocument {
  const proposal = findProposal(document, id);
  const rest = document.proposals.filter((item) => item.id !== proposal.id);
  const origin = { by: proposal.by, proposal: proposal.id };
  if (proposal.op === "insert") {
    const added = (proposal.blocks ?? []).map((block) => ({ ...block, origin }));
    return bump(document, insertAfter(document.blocks, added, proposal.after ?? null), rest);
  }
  const current = document.blocks.find((item) => item.id === proposal.blockId);
  if (!current) throw new BookiError("doc.proposal-gone", { id: proposal.id, block: proposal.blockId });
  if (!sameBlock(current, proposal.before)) {
    throw new BookiError("doc.proposal-stale", { id: proposal.id, block: proposal.blockId });
  }
  if (proposal.op === "edit") {
    return bump(
      document,
      document.blocks.map((item) => (item.id === proposal.blockId ? { ...proposal.block!, origin } : item)),
      rest,
    );
  }
  if (proposal.op === "remove") {
    return bump(
      document,
      document.blocks.filter((item) => item.id !== proposal.blockId),
      rest,
    );
  }
  const without = document.blocks.filter((item) => item.id !== proposal.blockId);
  return bump(document, insertAfter(without, [current], proposal.after ?? null), rest);
}

/** Reject or withdraw a proposal: nothing on the page changes. */
export function dropProposal(document: EditorDocument, id: string): EditorDocument {
  const proposal = findProposal(document, id);
  return { ...document, proposals: document.proposals.filter((item) => item.id !== proposal.id) };
}

/** A person's direct edit to the blocks. Bumps the version. */
export function setBlocks(document: EditorDocument, blocks: DocBlock[]): EditorDocument {
  return { ...document, version: document.version + 1, blocks: blocks.map(cleanBlock) };
}

/** Blocks whose text, type or mentions match: case-insensitive, words in any order. */
export function findBlocks(document: EditorDocument, query: string): DocBlock[] {
  const words = String(query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return document.blocks;
  return document.blocks.filter((block) => {
    const hay = [block.type, block.text, ...(block.refs ?? []).flatMap((ref) => [ref.id, ref.label, ref.kind])]
      .join(" ")
      .toLowerCase();
    return words.every((word) => hay.includes(word));
  });
}

/** The page as plain text, one block per line, for a model's context or a search index. */
export function documentText(document: Pick<EditorDocument, "blocks">): string {
  let n = 0;
  return document.blocks
    .map((block) => {
      n = block.type === "numbered" ? n + 1 : 0;
      switch (block.type) {
        case "heading":
          return `${"#".repeat(block.level ?? 2)} ${block.text}`;
        case "bullet":
          return `- ${block.text}`;
        case "numbered":
          return `${n}. ${block.text}`;
        case "todo":
          return `[${block.checked ? "x" : " "}] ${block.text}`;
        case "quote":
          return `> ${block.text}`;
        case "callout":
          return `! ${block.text}`;
        case "divider":
          return "---";
        default:
          return block.text;
      }
    })
    .join("\n");
}

// ── TipTap / ProseMirror JSON ─────────────────────────────────────────────
// An app that stores its pages as TipTap JSON keeps doing so: convert at the
// edge. Marks (bold, links) are flattened to text; nodes the editor has no
// block for come back as a paragraph of their text, with `attrs.id` kept.

type PmNode = { type: string; attrs?: Record<string, unknown>; content?: PmNode[]; text?: string };

function pmText(node: PmNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "mention") return `@${String(node.attrs?.label ?? node.attrs?.id ?? "")}`;
  return (node.content ?? []).map(pmText).join("");
}

function pmRefs(node: PmNode | undefined, out: BlockRef[] = []): BlockRef[] {
  if (!node) return out;
  if (node.type === "mention" && node.attrs?.id) {
    const kind = String(node.attrs.kind ?? "page");
    out.push({
      kind: (MENTION_KINDS.includes(kind as MentionKind) ? kind : "page") as MentionKind,
      id: String(node.attrs.id),
      label: String(node.attrs.label ?? node.attrs.id),
    });
  }
  for (const child of node.content ?? []) pmRefs(child, out);
  return out;
}

/** Read TipTap JSON (`editor.getJSON()`) as blocks. Ids come from `attrs.id` (or `blockId`) when present. */
export function fromTiptap(doc: PmNode, options: { idAttr?: string } = {}): DocBlock[] {
  const blocks: DocBlock[] = [];
  const taken: { id: string }[] = [];
  const idOf = (node: PmNode) => {
    const raw = node.attrs?.[options.idAttr ?? "id"] ?? node.attrs?.blockId;
    const id = typeof raw === "string" && raw && !taken.some((item) => item.id === raw) ? raw : nextId("b", taken);
    taken.push({ id });
    return id;
  };
  const push = (node: PmNode, type: BlockType, extra: Partial<DocBlock> = {}) => {
    const refs = pmRefs(node);
    blocks.push(cleanBlock({ id: idOf(node), type, text: pmText(node), ...(refs.length ? { refs } : {}), ...extra }));
  };
  for (const node of doc.content ?? []) {
    switch (node.type) {
      case "heading":
        push(node, "heading", { level: Math.min(3, Math.max(1, Number(node.attrs?.level ?? 2))) as 1 | 2 | 3 });
        break;
      case "bulletList":
      case "orderedList":
        for (const item of node.content ?? []) push(item, node.type === "bulletList" ? "bullet" : "numbered");
        break;
      case "taskList":
        for (const item of node.content ?? []) push(item, "todo", { checked: Boolean(item.attrs?.checked) });
        break;
      case "blockquote":
        push(node, "quote");
        break;
      case "callout":
        push(node, "callout");
        break;
      case "horizontalRule":
        push(node, "divider");
        break;
      default:
        push(node, "paragraph");
    }
  }
  return blocks;
}

function inline(block: DocBlock): PmNode[] {
  if (!block.text) return [];
  const refs = block.refs ?? [];
  if (refs.length === 0) return [{ type: "text", text: block.text }];
  const out: PmNode[] = [];
  let rest = block.text;
  while (rest) {
    const hits = refs
      .map((ref) => ({ ref, at: rest.indexOf(`@${ref.label}`) }))
      .filter((hit) => hit.at >= 0)
      .sort((a, b) => a.at - b.at);
    const hit = hits[0];
    if (!hit) {
      out.push({ type: "text", text: rest });
      break;
    }
    if (hit.at > 0) out.push({ type: "text", text: rest.slice(0, hit.at) });
    out.push({ type: "mention", attrs: { id: hit.ref.id, label: hit.ref.label, kind: hit.ref.kind } });
    rest = rest.slice(hit.at + hit.ref.label.length + 1);
  }
  return out;
}

/** Write blocks as TipTap JSON (`editor.commands.setContent(json)`). Mentions become `mention` nodes. */
export function toTiptap(blocks: DocBlock[], options: { idAttr?: string } = {}): PmNode {
  const idAttr = options.idAttr ?? "id";
  const content: PmNode[] = [];
  const paragraph = (block: DocBlock): PmNode => ({ type: "paragraph", content: inline(block) });
  for (const block of blocks) {
    const attrs = { [idAttr]: block.id };
    const last = content.at(-1);
    const listType = { bullet: "bulletList", numbered: "orderedList", todo: "taskList" }[block.type as string];
    if (listType) {
      const item: PmNode = {
        type: block.type === "todo" ? "taskItem" : "listItem",
        attrs: block.type === "todo" ? { ...attrs, checked: Boolean(block.checked) } : attrs,
        content: [paragraph(block)],
      };
      if (last?.type === listType) last.content!.push(item);
      else content.push({ type: listType, content: [item] });
      continue;
    }
    switch (block.type) {
      case "heading":
        content.push({ type: "heading", attrs: { ...attrs, level: block.level ?? 2 }, content: inline(block) });
        break;
      case "quote":
        content.push({ type: "blockquote", attrs, content: [paragraph(block)] });
        break;
      case "callout":
        content.push({ type: "callout", attrs, content: [paragraph(block)] });
        break;
      case "divider":
        content.push({ type: "horizontalRule", attrs });
        break;
      default:
        content.push({ type: "paragraph", attrs, content: inline(block) });
    }
  }
  return { type: "doc", content };
}

// ── HTML ──────────────────────────────────────────────────────────────────
// For an app that stores pages as HTML (a TipTap or ProseMirror editor's
// getHTML()). Top-level elements become blocks; ids come from `idAttr`; every
// other attribute is kept in `attrs` and written back. An element the editor
// cannot edit (a table, a figure, a data node, a paragraph holding one) becomes
// an `embed` that keeps its markup exactly. Bold, italics, code, struck text and
// links are read as inline markdown (**bold**, *italic*, `code`, ~~struck~~,
// [text](https://…)), so a person or an agent edits them as text and `toHtml`
// writes them back as markup. "flatten" drops them; "embed" keeps the block as
// it came instead.

export type HtmlOptions = {
  /** The attribute that holds a block's id. Default "data-block-id". */
  idAttr?: string;
  /** A mention in the app's markup, e.g. an attachment chip. Return null for anything else. */
  mentionFrom?: (element: Element) => BlockRef | null;
  /** How to write a mention back. Default `<span data-mention data-kind data-id>@Label</span>`. */
  mentionHtml?: (ref: BlockRef) => string;
  /** Formatting inside a block: inline markdown (default), dropped ("flatten"), or the block kept as an embed. */
  formatted?: "markdown" | "flatten" | "embed";
  /** An HTML parser, where there is no `DOMParser` (on a server: pass one from linkedom or jsdom). */
  parse?: (html: string) => Document;
};

const MARKS: Record<string, string> = { B: "**", STRONG: "**", I: "*", EM: "*", CODE: "`", S: "~~" };
const safeHref = (href: string) => /^(https?:|mailto:|\/|#)/i.test(href.trim());

/** Inline markdown in already escaped text, as markup. A link that is not http(s), mailto or relative stays text. */
function marksToHtml(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, text: string, href: string) =>
      safeHref(href) ? `<a href="${href}">${text}</a>` : all,
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<s>$1</s>");
}

const INLINE = new Set(["B", "STRONG", "I", "EM", "U", "S", "A", "CODE", "MARK", "SPAN", "SUB", "SUP"]);

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** An element's words, with a space between cells and lines. */
function wordsOf(element: Element): string {
  const words: string[] = [];
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        const text = (child.textContent ?? "").trim();
        if (text) words.push(text);
      } else if (child.nodeType === 1) walk(child);
    }
  };
  walk(element);
  return words.join(" ").replace(/\s+/g, " ");
}

const defaultMentionFrom = (element: Element): BlockRef | null => {
  if (!element.hasAttribute("data-mention")) return null;
  const kind = element.getAttribute("data-kind") ?? "page";
  return {
    kind: (MENTION_KINDS.includes(kind as MentionKind) ? kind : "page") as MentionKind,
    id: element.getAttribute("data-id") ?? "",
    label: (element.textContent ?? "").replace(/^@/, ""),
  };
};

const defaultMentionHtml = (ref: BlockRef) =>
  `<span data-mention="" data-kind="${escapeHtml(ref.kind)}" data-id="${escapeHtml(ref.id)}">@${escapeHtml(ref.label)}</span>`;

/** Blocks from HTML. Throws `doc.no-parser` where there is no DOMParser and no `parse`. */
export function fromHtml(html: string, options: HtmlOptions = {}): DocBlock[] {
  const idAttr = options.idAttr ?? "data-block-id";
  const mentionFrom = options.mentionFrom ?? defaultMentionFrom;
  const parse =
    options.parse ??
    (typeof DOMParser !== "undefined"
      ? (text: string) => new DOMParser().parseFromString(text, "text/html")
      : undefined);
  if (!parse) throw new BookiError("doc.no-parser", {});
  const body = parse(`<body>${html ?? ""}</body>`).body;
  const blocks: DocBlock[] = [];
  const taken: { id: string }[] = [];
  const idFor = (raw: string | null) => {
    const id = raw && !taken.some((item) => item.id === raw) ? raw : nextId("b", taken);
    taken.push({ id });
    return id;
  };
  const attrsOf = (element: Element) => {
    const out: Record<string, string> = {};
    for (const attr of Array.from(element.attributes)) if (attr.name !== idAttr) out[attr.name] = attr.value;
    return Object.keys(out).length ? out : undefined;
  };
  // The text of an inline run, or null when it holds something only an embed keeps.
  const read = (node: Element): { text: string; refs: BlockRef[] } | null => {
    let text = "";
    const refs: BlockRef[] = [];
    let plain = true;
    const walk = (current: Node): boolean => {
      for (const child of Array.from(current.childNodes)) {
        if (child.nodeType === 3) {
          text += child.textContent ?? "";
          continue;
        }
        if (child.nodeType !== 1) continue;
        const element = child as Element;
        const ref = mentionFrom(element);
        if (ref) {
          refs.push(ref);
          text += `@${ref.label}`;
          continue;
        }
        if (element.tagName === "BR") {
          text += "\n";
          continue;
        }
        if (element.tagName === "P" && text) text += "\n";
        if (element.tagName !== "P" && !INLINE.has(element.tagName)) return false;
        if (element.tagName === "SPAN" && Array.from(element.attributes).some((attr) => attr.name.startsWith("data-")))
          return false;
        if (element.tagName !== "P" && element.tagName !== "SPAN") plain = false;
        const marked = options.formatted !== "flatten" && options.formatted !== "embed";
        const mark = marked ? MARKS[element.tagName] : undefined;
        const href = marked && element.tagName === "A" ? element.getAttribute("href") : null;
        if (mark) text += mark;
        if (href && safeHref(href)) text += "[";
        if (!walk(element)) return false;
        if (href && safeHref(href)) text += `](${href})`;
        if (mark) text += mark;
      }
      return true;
    };
    if (!walk(node)) return null;
    if (!plain && options.formatted === "embed") return null;
    return { text, refs };
  };
  const embed = (element: Element) =>
    blocks.push({
      id: idFor(element.getAttribute(idAttr)),
      type: "embed",
      text: wordsOf(element),
      raw: element.outerHTML,
    });
  const push = (element: Element, type: BlockType, extra: Partial<DocBlock> = {}, from: Element = element) => {
    const content = read(from);
    if (!content) return embed(element);
    const attrs = attrsOf(element);
    blocks.push(
      cleanBlock({
        id: idFor(element.getAttribute(idAttr)),
        type,
        text: content.text,
        ...(content.refs.length ? { refs: content.refs } : {}),
        ...(attrs ? { attrs } : {}),
        ...extra,
      }),
    );
  };
  for (const element of Array.from(body.children)) {
    const tag = element.tagName;
    if (tag === "P") push(element, "paragraph");
    else if (/^H[1-6]$/.test(tag)) push(element, "heading", { level: Math.min(3, Number(tag[1])) as 1 | 2 | 3 });
    else if (tag === "BLOCKQUOTE") push(element, "quote");
    else if (tag === "HR") blocks.push({ id: idFor(element.getAttribute(idAttr)), type: "divider", text: "" });
    else if (tag === "UL" || tag === "OL") {
      const items = Array.from(element.children);
      const task = element.getAttribute("data-type") === "taskList";
      // A list item that nests another list, or holds more than text, keeps the whole list as it is.
      if (items.some((item) => item.tagName !== "LI" || item.querySelector("ul, ol") || !read(item))) {
        embed(element);
        continue;
      }
      items.forEach((item, n) => {
        const attrs = n === 0 ? attrsOf(element) : undefined;
        const content = read(item)!;
        blocks.push(
          cleanBlock({
            id: idFor(item.getAttribute(idAttr) ?? (n === 0 ? element.getAttribute(idAttr) : null)),
            type: task ? "todo" : tag === "UL" ? "bullet" : "numbered",
            text: content.text,
            ...(task ? { checked: item.getAttribute("data-checked") === "true" } : {}),
            ...(content.refs.length ? { refs: content.refs } : {}),
            ...(attrs ? { attrs } : {}),
          }),
        );
      });
    } else embed(element);
  }
  return blocks;
}

/** HTML from blocks: what `fromHtml` reads back. Embeds are written exactly as they came. */
export function toHtml(blocks: DocBlock[], options: HtmlOptions = {}): string {
  const idAttr = options.idAttr ?? "data-block-id";
  const mentionHtml = options.mentionHtml ?? defaultMentionHtml;
  const attrs = (block: DocBlock, extra: Record<string, string> = {}) =>
    Object.entries({ ...block.attrs, [idAttr]: block.id, ...extra })
      .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
      .join("");
  const write = (text: string) => (options.formatted === "flatten" ? escapeHtml(text) : marksToHtml(escapeHtml(text)));
  const inline = (block: DocBlock) => {
    const refs = block.refs ?? [];
    let out = "";
    let rest = block.text;
    while (rest) {
      const hit = refs
        .map((ref) => ({ ref, at: rest.indexOf(`@${ref.label}`) }))
        .filter((item) => item.at >= 0)
        .sort((a, b) => a.at - b.at)[0];
      if (!hit) {
        out += write(rest);
        break;
      }
      out += write(rest.slice(0, hit.at)) + mentionHtml(hit.ref);
      rest = rest.slice(hit.at + hit.ref.label.length + 1);
    }
    return out.replace(/\n/g, "<br>");
  };
  let html = "";
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    const list = { bullet: "ul", numbered: "ol", todo: "ul" }[block.type as string];
    if (list) {
      const run: DocBlock[] = [block];
      while (blocks[i + 1]?.type === block.type) run.push(blocks[++i]!);
      const task = block.type === "todo";
      const items = run
        .map(
          (item) =>
            `<li${task ? ` data-type="taskItem" data-checked="${item.checked ? "true" : "false"}"` : ""}><p>${inline(item)}</p></li>`,
        )
        .join("");
      html += `<${list}${attrs(block, task ? { "data-type": "taskList" } : {})}>${items}</${list}>`;
      continue;
    }
    switch (block.type) {
      case "heading":
        html += `<h${block.level ?? 2}${attrs(block)}>${inline(block)}</h${block.level ?? 2}>`;
        break;
      case "quote":
        html += `<blockquote${attrs(block)}><p>${inline(block)}</p></blockquote>`;
        break;
      case "callout":
        html += `<aside${attrs(block, { "data-callout": "" })}><p>${inline(block)}</p></aside>`;
        break;
      case "divider":
        html += `<hr${attrs(block)}>`;
        break;
      case "embed":
        html += block.raw ?? "";
        break;
      default:
        html += `<p${attrs(block)}>${inline(block)}</p>`;
    }
  }
  return html;
}
