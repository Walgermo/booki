import {
  acceptProposal,
  cleanBlock,
  dropProposal,
  findBlock,
  findBlocks,
  findProposal,
  newBlockId,
  patchBlock,
  proposeEdit,
  proposeInsert,
  proposeMove,
  proposeRemove,
  BLOCK_TYPES,
  EMPTY_DOCUMENT,
  type BlockPatch,
  type BlockType,
  type DocBlock,
  type DocProposal,
  type EditorDocument,
  type Mention,
  type ProposalOutcome,
} from "@booki-aui/core/document-blocks";
import { BookiError } from "@booki-aui/core/msg";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { refuseDenied } from "./access.js";
import { asEvent } from "./as-event.js";
import { checkFields, recordOf, textOf } from "./fields.js";
import { personOnly } from "./person-only.js";

export { buttonKey } from "./fields.js";

/**
 * A "/" command. One with `type` turns the block into that type; one with
 * `blocks` inserts them after the block (a template). Both an agent can run,
 * as a proposal. One with neither is the app's own (a picker, an upload): the
 * editor calls `onCommand` for a person and refuses it for an agent.
 */
export type SlashCommand = {
  id: string;
  label: string;
  /** Extra words the "/" search matches, e.g. ["h1", "title"]. */
  keywords?: string[];
  /** A heading in the menu, e.g. "Blocks" or "Insert". */
  group?: string;
  hint?: string;
  type?: BlockType;
  level?: 1 | 2 | 3;
  blocks?: Omit<DocBlock, "id">[];
};

/** One row in the open "/" or "@" menu. */
export type MenuItem = { id: string; label: string; hint?: string; group?: string; kind?: string };

export type DocumentAuditEvent = {
  /** What happened: propose-insert, propose-edit, propose-move, propose-remove, accept, reject, withdraw, edit-text, insert, remove, move, turn-into, check, command. */
  action: string;
  /** `agent:<id>` for the agent, the person's id otherwise. */
  actor: string;
  documentId: string;
  /** The version after the change. */
  version: number;
  blockId?: string;
  proposalId?: string;
  outcome?: ProposalOutcome;
  /** Short and plain, e.g. 'b2: "Revenue…" → "Sales…"'. */
  detail?: string;
  at: string;
};

export type Options = {
  document?: EditorDocument;
  defaultDocument?: EditorDocument;
  /** The "/" commands. Defaults to the block types. Pass `[...DEFAULT_COMMANDS, …yours]` to add your own. */
  commands?: SlashCommand[];
  /** What "@" can mention: files, evidence, people, pages. The app passes them; the editor never invents one. */
  mentions?: Mention[];
  /** Id of the person at the keyboard: the actor of their edits, accepts and rejects. */
  actor?: string;
  /** The agent's id in proposals and audit rows: `agent:<agentId>`. Default "agent". */
  agentId?: string;
  /** No editing and no proposals, e.g. once the page is signed. */
  readOnly?: boolean;
  /** At most one proposal waits at a time, as some apps require. Default false. */
  onePending?: boolean;
  /** A person's methods their role does not allow, each with the reason. Set by `BookiAccessProvider`. */
  denied?: Record<string, string>;
  /**
   * The proposals that wait, when the app stores them itself (its own table, a server queue). With `onProposalsChange`
   * they outlive the page: pass back what you stored. `defaultProposals` seeds them once.
   */
  proposals?: DocProposal[];
  defaultProposals?: DocProposal[];
  /** Every change to the waiting proposals: proposed, accepted, rejected, withdrawn. */
  onProposalsChange?: (proposals: DocProposal[], details: { reason: string }) => void;
  onDocumentChange?: (
    document: EditorDocument,
    details: { reason: string; source?: string; cancel?: () => void },
  ) => void;
  /** Every change, as a row for the app's audit trail. */
  onAudit?: (event: DocumentAuditEvent) => void;
  /** The app's own command (one without `type` or `blocks`), run for a person. */
  onCommand?: (id: string, details: { blockId: string }) => void;
};

type Menu = { kind: "slash" | "mention"; blockId: string; query: string; start: number; active: number };

const HEADING = (level: 1 | 2 | 3, label: string, keywords: string[]): SlashCommand => ({
  id: `heading${level}`,
  label,
  keywords,
  group: "Blocks",
  type: "heading",
  level,
});

/** The block types as "/" commands, in English. The React control passes its own words. */
export const DEFAULT_COMMANDS: SlashCommand[] = [
  { id: "text", label: "Text", keywords: ["paragraph", "p"], group: "Blocks", type: "paragraph" },
  HEADING(1, "Heading 1", ["h1", "title"]),
  HEADING(2, "Heading 2", ["h2"]),
  HEADING(3, "Heading 3", ["h3"]),
  { id: "bullet", label: "Bulleted list", keywords: ["ul", "list", "-"], group: "Blocks", type: "bullet" },
  { id: "numbered", label: "Numbered list", keywords: ["ol", "1."], group: "Blocks", type: "numbered" },
  { id: "todo", label: "To-do", keywords: ["task", "check", "[]"], group: "Blocks", type: "todo" },
  { id: "quote", label: "Quote", keywords: [">"], group: "Blocks", type: "quote" },
  { id: "callout", label: "Callout", keywords: ["note", "!"], group: "Blocks", type: "callout" },
  { id: "divider", label: "Divider", keywords: ["hr", "---", "line"], group: "Blocks", type: "divider" },
];

/** What the agent reads for a block. */
export type BlockView = Omit<DocBlock, "raw" | "attrs"> & { proposal?: string };

/** What the agent reads for a proposal: what it would do, in plain fields. */
export type ProposalView = {
  id: string;
  op: DocProposal["op"];
  blockId: string;
  after?: string | null;
  type?: BlockType;
  text?: string;
  count?: number;
  reason?: string;
  by: string;
};

/** How to call the agent actions, shown in the snapshot so the first try is right. Each is a proposal. */
export const INSERT_FORMAT = 'insertBlock({ after: "b2"|null, type?: "paragraph", text, mentions?: ["e12"], reason? })';
export const EDIT_FORMAT = 'editBlock("b2", { text?, type?, level?, checked?, mentions?: ["e12"], reason? })';
export const MOVE_FORMAT =
  'moveBlock("b3", { after: "b1"|null }); removeBlock("b3"); runCommand("heading2", { block: "b3" })';

const PATCH_FIELDS = ["text", "type", "level", "checked", "mentions", "reason"] as const;
const INSERT_FIELDS = ["after", ...PATCH_FIELDS] as const;
const MOVE_FIELDS = ["after", "reason"] as const;
const REASON_FIELDS = ["reason"] as const;
const COMMAND_FIELDS = ["block", "reason"] as const;

function proposalView(proposal: DocProposal): ProposalView {
  const shown = proposal.op === "insert" ? proposal.blocks?.[0] : proposal.block;
  return {
    id: proposal.id,
    op: proposal.op,
    blockId: proposal.blockId,
    ...(proposal.op === "insert" || proposal.op === "move" ? { after: proposal.after ?? null } : {}),
    ...(shown ? { type: shown.type, text: shown.text } : {}),
    ...(proposal.blocks && proposal.blocks.length > 1 ? { count: proposal.blocks.length } : {}),
    ...(proposal.reason ? { reason: proposal.reason } : {}),
    by: proposal.by,
  };
}

export function derive(document: EditorDocument, options: Options) {
  const waiting = new Map(document.proposals.map((proposal) => [proposal.blockId, proposal.id]));
  const commands = options.commands ?? DEFAULT_COMMANDS;
  return {
    version: document.version,
    // Not `readOnly`: the bridge would then offer no actions, and the agent would not learn why.
    locked: Boolean(options.readOnly),
    // The app's markup and attributes stay out of the snapshot: the agent reads words.
    blocks: document.blocks.map(({ raw: _raw, attrs: _attrs, ...block }): BlockView => {
      const id = waiting.get(block.id);
      return id ? { ...block, proposal: id } : block;
    }),
    proposals: document.proposals.map(proposalView),
    commands: commands.map((command) => ({
      name: command.id,
      label: command.label,
      agent: Boolean(command.type || command.blocks),
    })),
    mentions: (options.mentions ?? []).map(({ kind, id, label }) => ({ kind, id, label })),
  };
}

function menuItems(menu: Menu | null, options: Options): MenuItem[] {
  if (!menu) return [];
  const query = menu.query.toLowerCase();
  if (menu.kind === "slash") {
    return (options.commands ?? DEFAULT_COMMANDS)
      .filter((command) =>
        [command.label, command.id, ...(command.keywords ?? [])].some((word) => word.toLowerCase().includes(query)),
      )
      .slice(0, 20)
      .map(({ id, label, hint, group }) => ({ id, label, ...(hint ? { hint } : {}), ...(group ? { group } : {}) }));
  }
  return (options.mentions ?? [])
    .filter((item) => [item.label, item.id, item.hint ?? ""].some((word) => word.toLowerCase().includes(query)))
    .slice(0, 20)
    .map(({ id, label, hint, kind }) => ({ id, label, kind, ...(hint ? { hint } : {}) }));
}

/** The "/" or "@" being typed just before the caret, if any. */
export function triggerAt(text: string, caret: number): Omit<Menu, "blockId" | "active"> | null {
  const match = /(^|\s)([/@])([^\s/@]{0,40})$/.exec(text.slice(0, caret));
  if (!match) return null;
  return {
    kind: match[2] === "/" ? "slash" : "mention",
    query: match[3] ?? "",
    start: caret - (match[3] ?? "").length - 1,
  };
}

const LIST: BlockType[] = ["bullet", "numbered", "todo"];

const safe = (text: string) => text.replace(/[^\w-]/g, "_");
/** The id of a block's open menu, for `aria-controls`. Renderers give the menu this id. */
export const menuId = (documentId: string, blockId: string) =>
  `bk-doc-${safe(documentId || "page")}-${safe(blockId)}-menu`;
/** The id of one option in that menu, for `aria-activedescendant`. */
export const optionId = (documentId: string, blockId: string, itemId: string) =>
  `${menuId(documentId, blockId)}-${safe(itemId)}`;

/**
 * A block editor for working papers. A person types in blocks, "/" opens the
 * commands and "@" mentions the files, evidence, people and pages the app
 * passes. An agent reads the page as blocks and can find, insert, edit, move
 * and remove blocks or run a command: every one is a proposal, shown in the
 * agent's colour, that waits for a person. Accepting and rejecting are a
 * person's buttons, never agent actions; an agent may withdraw its own.
 */
export const documentEditor = definePrimitive({
  name: "document-editor",
  options: {
    document: "value",
    defaultDocument: "value",
    commands: "value",
    mentions: "value",
    actor: "string",
    agentId: "string",
    readOnly: "boolean",
    onePending: "boolean",
    denied: "value",
    proposals: "value",
    defaultProposals: "value",
    onProposalsChange: "callback",
    onDocumentChange: "callback",
    onAudit: "callback",
    onCommand: "callback",
  },
  controlled: [
    "version",
    "locked",
    "blocks",
    "proposals",
    "commands",
    "mentions",
    "insertFormat",
    "editFormat",
    "moveFormat",
  ],
  state: (options: Options) => {
    const base = options.document ?? options.defaultDocument ?? EMPTY_DOCUMENT;
    const queue = options.proposals ?? options.defaultProposals;
    const document = queue ? { ...base, proposals: queue } : base;
    return {
      document,
      refusal: "",
      menu: null as Menu | null,
      items: [] as MenuItem[],
      insertFormat: INSERT_FORMAT,
      editFormat: EDIT_FORMAT,
      moveFormat: MOVE_FORMAT,
      ...derive(document, options),
    };
  },
  sync: (options: Options) => {
    const base = { locked: Boolean(options.readOnly) };
    if (options.document === undefined) return base;
    const document = options.proposals ? { ...options.document, proposals: options.proposals } : options.document;
    return { ...base, document, ...derive(document, options) };
  },
  api: (context) => {
    const change = createChange(context);
    const now = () => new Date().toISOString();
    const doc = () => context.store.get().document;
    const agent = () => `agent:${context.options().agentId || "agent"}`;
    // Where the person was when an edit began, so the audit row says what the text was.
    const editing = new Map<string, string>();

    const audit = (row: Omit<DocumentAuditEvent, "documentId" | "version" | "at">, after: EditorDocument) => {
      context.options().onAudit?.({ ...row, documentId: after.id, version: after.version, at: now() });
    };
    // Proposals the app controls without controlling the blocks: take each new list as it arrives.
    context.onOptions((options) => {
      if (options.proposals === undefined || options.document !== undefined) return;
      const current = context.store.get().document;
      if (current.proposals === options.proposals) return;
      const next = { ...current, proposals: options.proposals };
      context.store.set({ document: next, ...derive(next, options) });
    });
    const commit = (next: EditorDocument, reason: string, event?: Event) => {
      const before = context.store.get().document.proposals;
      const ok = change("document", next, { reason, event });
      if (ok && before !== next.proposals) context.options().onProposalsChange?.(next.proposals, { reason });
      if (ok && context.options().document === undefined) {
        context.store.set({ refusal: "", ...derive(next, context.options()) });
      } else if (ok) context.store.set({ refusal: "" });
      return ok;
    };
    const shown = <T>(run: () => T): T => {
      try {
        return run();
      } catch (error) {
        context.store.set({ refusal: (error as Error).message });
        throw error;
      }
    };
    const writable = () => {
      if (context.options().readOnly) throw new BookiError("doc.read-only", {});
    };
    const person = (method: string) => {
      refuseDenied(context.options(), method);
      const actor = String(context.options().actor ?? "").trim();
      if (actor === "") throw new BookiError("permissions.signed-out", { permission: "audit.prepare" });
      return actor;
    };
    const commands = () => context.options().commands ?? DEFAULT_COMMANDS;
    const command = (name: unknown) => {
      const found = commands().find((item) => item.id === String(name));
      if (!found) {
        throw new BookiError("doc.unknown-command", {
          name: String(name),
          names: commands()
            .map((item) => item.id)
            .join(", "),
        });
      }
      return found;
    };
    const short = (text: string) => (text.length > 40 ? `${text.slice(0, 39)}…` : text);

    // ── Proposals (the agent's only way to change the page) ──
    const proposed = (result: { document: EditorDocument; proposal: DocProposal }) => {
      const ok = commit(result.document, `propose-${result.proposal.op}`);
      if (!ok) return false;
      const text = result.proposal.blocks?.[0]?.text ?? result.proposal.block?.text;
      audit(
        {
          action: `propose-${result.proposal.op}`,
          actor: result.proposal.by,
          blockId: result.proposal.blockId,
          proposalId: result.proposal.id,
          ...(text ? { detail: `${result.proposal.blockId}: "${short(text)}"` } : {}),
        },
        result.document,
      );
      return { proposal: result.proposal.id, block: result.proposal.blockId };
    };
    const how = (reason?: unknown) => ({
      by: agent(),
      at: now(),
      reason: reason === undefined ? undefined : textOf(reason, "reason"),
      onePending: context.options().onePending,
    });
    const patchOf = (fields: Record<string, unknown>): BlockPatch => {
      const patch: BlockPatch = {};
      if (fields.text !== undefined) patch.text = textOf(fields.text, "text");
      if (fields.type !== undefined) patch.type = fields.type as BlockType;
      if (fields.level !== undefined) patch.level = Number(fields.level) as 1 | 2 | 3;
      if (fields.checked !== undefined) patch.checked = Boolean(fields.checked);
      if (fields.mentions !== undefined) patch.mentions = fields.mentions as string[];
      return patch;
    };
    const proposeCommand = (found: SlashCommand, blockId: string, reason?: unknown) => {
      const block = findBlock(doc(), blockId);
      if (found.type) {
        return proposed(
          proposeEdit(
            doc(),
            block.id,
            patchBlock(block, { type: found.type, ...(found.level ? { level: found.level } : {}) }),
            how(reason),
          ),
        );
      }
      if (found.blocks?.length) {
        return proposed(proposeInsert(doc(), { after: block.id, blocks: found.blocks }, how(reason)));
      }
      throw new BookiError("doc.command-person", {
        name: found.id,
        names: commands()
          .filter((item) => item.type || item.blocks)
          .map((item) => item.id)
          .join(", "),
      });
    };

    // ── A person's direct edits ──
    const setBlocks = (blocks: DocBlock[], reason: string, event?: Event, bump = true) => {
      const current = doc();
      const next = { ...current, version: current.version + (bump ? 1 : 0), blocks };
      return commit(next, reason, event) ? next : null;
    };
    const replace = (block: DocBlock) => doc().blocks.map((item) => (item.id === block.id ? block : item));
    const closeMenu = () => context.store.set({ menu: null, items: [] });
    const focusBlock = (from: Event | undefined, id: string, caret?: number) => {
      const root = (from?.target as HTMLElement | null)?.closest?.('[data-slot="document-editor"]');
      if (!root || typeof requestAnimationFrame === "undefined") return;
      requestAnimationFrame(() => {
        const el = root.querySelector<HTMLTextAreaElement>(`[data-slot="document-editor-block"][data-block="${id}"]`);
        if (!el) return;
        el.focus();
        const at = caret ?? el.value.length;
        el.setSelectionRange?.(at, at);
      });
    };
    const insertNew = (after: string, block: Omit<DocBlock, "id">, event?: Event) => {
      const actor = person("edit");
      const id = newBlockId(doc());
      const at = doc().blocks.findIndex((item) => item.id === after);
      const blocks = [...doc().blocks];
      blocks.splice(at + 1, 0, cleanBlock({ ...block, id } as DocBlock));
      const next = setBlocks(blocks, "insert", event);
      if (next) audit({ action: "insert", actor, blockId: id }, next);
      return id;
    };
    const pickMenu = (id: string, event?: Event) => {
      const menu = context.store.get().menu;
      if (!menu) return false;
      const actor = person("edit");
      const block = findBlock(doc(), menu.blockId);
      const end = menu.start + 1 + menu.query.length;
      const bare = block.text.slice(0, menu.start) + block.text.slice(end);
      closeMenu();
      if (menu.kind === "mention") {
        const item = (context.options().mentions ?? []).find((mention) => mention.id === id);
        if (!item) return false;
        const inserted = `@${item.label} `;
        const text = block.text.slice(0, menu.start) + inserted + block.text.slice(end);
        const refs = [
          ...(block.refs ?? []).filter((ref) => ref.id !== item.id),
          { kind: item.kind, id: item.id, label: item.label },
        ];
        const next = setBlocks(replace(cleanBlock({ ...block, text, refs })), "mention", event, false);
        if (next) audit({ action: "mention", actor, blockId: block.id, detail: `${item.kind} ${item.id}` }, next);
        focusBlock(event, block.id, menu.start + inserted.length);
        return Boolean(next);
      }
      const found = command(id);
      if (found.type) {
        const turned = cleanBlock({
          ...block,
          text: bare,
          type: found.type,
          ...(found.level ? { level: found.level } : {}),
        });
        const next = setBlocks(replace(turned), "turn-into", event);
        if (next)
          audit({ action: "turn-into", actor, blockId: block.id, detail: `${block.type} → ${found.type}` }, next);
        if (found.type === "divider") {
          const added = insertNew(block.id, { type: "paragraph", text: "" }, event);
          focusBlock(event, added, 0);
        } else focusBlock(event, block.id, menu.start);
        return Boolean(next);
      }
      if (found.blocks?.length) {
        const current = doc();
        // Fresh ids, in order.
        const added: DocBlock[] = [];
        for (const item of found.blocks) {
          const id = newBlockId({ ...current, blocks: [...current.blocks, ...added] });
          added.push(cleanBlock({ ...item, id } as DocBlock));
        }
        const at = current.blocks.findIndex((item) => item.id === block.id);
        const blocks = [...current.blocks];
        // An empty block the command was typed in is replaced by the template.
        if (bare.trim() === "") blocks.splice(at, 1, ...added);
        else blocks.splice(at, 1, { ...block, text: bare }, ...added);
        const next = setBlocks(blocks, "command", event);
        if (next) audit({ action: "command", actor, blockId: added[0]!.id, detail: found.id }, next);
        focusBlock(event, added.at(-1)!.id);
        return Boolean(next);
      }
      setBlocks(replace({ ...block, text: bare }), "command", event, false);
      context.options().onCommand?.(found.id, { blockId: block.id });
      audit({ action: "command", actor, blockId: block.id, detail: found.id }, doc());
      return true;
    };

    return {
      // ── Agent: read ──
      /** Agent: blocks whose text, type or mentions match the words, e.g. findBlocks("revenue cut-off"). */
      findBlocks: (query: string) =>
        findBlocks(doc(), textOf(query, "findBlocks")).map(({ id, type, text }) => ({ id, type, text })),

      // ── Agent: propose ──
      /** Agent: propose a new block after a block (or at the top with after: null). */
      insertBlock: (input: Record<string, unknown>) =>
        shown(() => {
          writable();
          const fields = checkFields(
            "insertBlock",
            input,
            INSERT_FIELDS,
            'insertBlock({ after: "b2", type: "paragraph", text: "…" })',
          );
          const block = patchBlock(
            { id: "new", type: "paragraph", text: "" },
            { type: "paragraph", ...patchOf(fields) },
            context.options().mentions,
          );
          const { id: _id, ...rest } = block;
          return proposed(
            proposeInsert(doc(), { after: fields.after as string | null, block: rest }, how(fields.reason)),
          );
        }),
      /** Agent: propose a change to a block's text, type, level, checked or mentions. */
      editBlock: (id: string, patch: Record<string, unknown>) =>
        shown(() => {
          writable();
          const block = findBlock(doc(), textOf(id, "editBlock"));
          const fields = checkFields("editBlock", patch, PATCH_FIELDS, 'editBlock("b2", { text: "…" })');
          return proposed(
            proposeEdit(
              doc(),
              block.id,
              patchBlock(block, patchOf(fields), context.options().mentions),
              how(fields.reason),
            ),
          );
        }),
      /** Agent: propose moving a block after another (after: null is the top). */
      moveBlock: (id: string, input: Record<string, unknown>) =>
        shown(() => {
          writable();
          const fields = checkFields("moveBlock", input, MOVE_FIELDS, 'moveBlock("b3", { after: "b1" })');
          const after = fields.after === undefined || fields.after === null ? null : String(fields.after);
          return proposed(proposeMove(doc(), textOf(id, "moveBlock"), after, how(fields.reason)));
        }),
      /** Agent: propose removing a block. */
      removeBlock: (id: string, input?: Record<string, unknown>) =>
        shown(() => {
          writable();
          const fields =
            input === undefined
              ? {}
              : checkFields("removeBlock", input, REASON_FIELDS, 'removeBlock("b3", { reason: "…" })');
          return proposed(proposeRemove(doc(), textOf(id, "removeBlock"), how(fields.reason)));
        }),
      /** Agent: run a "/" command by name on a block (default the last), as a proposal. */
      runCommand: (name: string, input?: Record<string, unknown>) =>
        shown(() => {
          writable();
          const found = command(name);
          const fields =
            input === undefined
              ? {}
              : checkFields("runCommand", input, COMMAND_FIELDS, 'runCommand("heading2", { block: "b3" })');
          const last = doc().blocks.at(-1);
          const blockId = fields.block === undefined ? last?.id : String(fields.block);
          if (!blockId) throw new BookiError("doc.no-block", { id: "(none)", ids: "none" });
          return proposeCommand(found, blockId, fields.reason);
        }),
      /** Agent: withdraw its own proposal that still waits. */
      withdrawProposal: (id: string) =>
        shown(() => {
          const proposal = findProposal(doc(), textOf(id, "withdrawProposal"));
          if (!proposal.by.startsWith("agent")) {
            throw new BookiError("doc.not-own-proposal", { id: proposal.id, by: proposal.by });
          }
          const next = dropProposal(doc(), proposal.id);
          const ok = commit(next, "withdraw");
          if (ok)
            audit(
              {
                action: "withdraw",
                actor: proposal.by,
                proposalId: proposal.id,
                blockId: proposal.blockId,
                outcome: "withdrawn",
              },
              next,
            );
          return ok;
        }),

      // Everything below is for a person. It is not in `agent.actions`, so the
      // bridge refuses a step that names it.
      /** Person only: the proposal lands on the page. */
      accept: (id: string, event?: Event) =>
        shown(() => {
          const actor = person("accept");
          const proposal = findProposal(doc(), id);
          const next = acceptProposal(doc(), proposal.id);
          const ok = commit(next, "accept", event);
          if (ok)
            audit(
              {
                action: "accept",
                actor,
                proposalId: proposal.id,
                blockId: proposal.blockId,
                outcome: "accepted",
                detail: `${proposal.op} by ${proposal.by}`,
              },
              next,
            );
          return ok;
        }),
      /** Person only: the proposal is dropped; the page stays as it is. */
      reject: (id: string, event?: Event) =>
        shown(() => {
          const actor = person("reject");
          const proposal = findProposal(doc(), id);
          const next = dropProposal(doc(), proposal.id);
          const ok = commit(next, "reject", event);
          if (ok)
            audit(
              {
                action: "reject",
                actor,
                proposalId: proposal.id,
                blockId: proposal.blockId,
                outcome: "rejected",
                detail: `${proposal.op} by ${proposal.by}`,
              },
              next,
            );
          return ok;
        }),
      /** Person: the text typed in a block, and where the caret is. Opens "/" and "@". */
      typed: (id: string, text: string, caret: number, event?: Event) =>
        shown(() => {
          writable();
          person("edit");
          const block = findBlock(doc(), id);
          if (!editing.has(block.id)) editing.set(block.id, block.text);
          // Markdown-style shortcuts at the start of an empty paragraph.
          const shortcut: Record<string, Partial<DocBlock>> = {
            "- ": { type: "bullet" },
            "* ": { type: "bullet" },
            "1. ": { type: "numbered" },
            "[] ": { type: "todo" },
            "> ": { type: "quote" },
            "# ": { type: "heading", level: 1 },
            "## ": { type: "heading", level: 2 },
            "### ": { type: "heading", level: 3 },
          };
          const hit = block.type === "paragraph" ? shortcut[text] : undefined;
          // A person's change makes the block theirs: the agent's origin goes.
          const { origin: _origin, ...own } = block;
          const next = hit
            ? cleanBlock({ ...own, ...hit, text: "" } as DocBlock)
            : cleanBlock({ ...own, text: String(text) });
          setBlocks(replace(next), hit ? "turn-into" : "edit-text", asEvent(event), Boolean(hit));
          const trigger = hit ? null : triggerAt(String(text), Number(caret));
          if (!trigger) return closeMenu();
          const menu: Menu = { ...trigger, blockId: block.id, active: 0 };
          context.store.set({ menu, items: menuItems(menu, context.options()) });
        }),
      /** Person: the block lost focus. One audit row per edit, not per keystroke. */
      left: (id: string) => {
        const before = editing.get(id);
        editing.delete(id);
        const block = doc().blocks.find((item) => item.id === id);
        if (before !== undefined && block && block.text !== before) {
          audit(
            {
              action: "edit-text",
              actor: String(context.options().actor ?? ""),
              blockId: id,
              detail: `${id}: "${short(before)}" → "${short(block.text)}"`,
            },
            doc(),
          );
        }
        if (context.store.get().menu?.blockId === id) closeMenu();
      },
      /** Person: a key in a block. Returns true when the editor handled it. */
      key: (id: string, event: KeyboardEvent) =>
        shown(() => {
          const el = event.target as HTMLTextAreaElement;
          const menu = context.store.get().menu;
          const items = context.store.get().items;
          if (menu && menu.blockId === id && items.length) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              const step = event.key === "ArrowDown" ? 1 : -1;
              context.store.set({ menu: { ...menu, active: (menu.active + step + items.length) % items.length } });
              return true;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              pickMenu(items[menu.active]!.id, event);
              return true;
            }
          }
          if (menu && event.key === "Escape") {
            closeMenu();
            return true;
          }
          if (context.options().readOnly) return false;
          const blocks = doc().blocks;
          const index = blocks.findIndex((item) => item.id === id);
          const block = blocks[index];
          if (!block) return false;
          const caret = el.selectionStart ?? 0;
          const collapsed = caret === (el.selectionEnd ?? caret);
          if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            const actor = person("edit");
            if (!editing.has(id)) editing.set(id, block.text);
            if (LIST.includes(block.type) && block.text === "") {
              const next = setBlocks(replace(cleanBlock({ ...block, type: "paragraph" })), "turn-into", event);
              if (next) audit({ action: "turn-into", actor, blockId: id, detail: `${block.type} → paragraph` }, next);
              return true;
            }
            const head = block.text.slice(0, caret);
            const tail = block.text.slice(el.selectionEnd ?? caret);
            const type: BlockType = LIST.includes(block.type) ? block.type : "paragraph";
            setBlocks(replace(cleanBlock({ ...block, text: head })), "edit-text", event, false);
            const added = insertNew(id, { type, text: tail }, event);
            focusBlock(event, added, 0);
            return true;
          }
          if (event.key === "Backspace" && collapsed && caret === 0) {
            const actor = person("edit");
            if (block.type !== "paragraph" && block.type !== "divider") {
              const next = setBlocks(replace(cleanBlock({ ...block, type: "paragraph" })), "turn-into", event);
              if (next) audit({ action: "turn-into", actor, blockId: id, detail: `${block.type} → paragraph` }, next);
              return true;
            }
            const previous = blocks[index - 1];
            if (!previous || previous.type === "embed") return false;
            if (doc().proposals.some((item) => item.blockId === id || item.blockId === previous.id)) return false;
            const merged =
              previous.type === "divider"
                ? null
                : cleanBlock({
                    ...previous,
                    text: previous.text + block.text,
                    refs: [...(previous.refs ?? []), ...(block.refs ?? [])],
                  });
            const rest = blocks.filter((item) => item.id !== id && (merged || item.id !== previous.id));
            const next = setBlocks(
              merged ? rest.map((item) => (item.id === previous.id ? merged : item)) : rest,
              "remove",
              event,
            );
            if (next) audit({ action: "remove", actor, blockId: merged ? id : previous.id }, next);
            const target = merged ? previous : blocks[index - 2];
            if (target) focusBlock(event, target.id, merged ? previous.text.length : undefined);
            return true;
          }
          if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            const actor = person("edit");
            const to = index + (event.key === "ArrowUp" ? -1 : 1);
            if (to < 0 || to >= blocks.length) return true;
            const moved = [...blocks];
            moved.splice(index, 1);
            moved.splice(to, 0, block);
            const next = setBlocks(moved, "move", event);
            if (next) audit({ action: "move", actor, blockId: id }, next);
            focusBlock(event, id, caret);
            return true;
          }
          if (event.key === "ArrowUp" && collapsed && caret === 0 && index > 0) {
            focusBlock(event, blocks[index - 1]!.id);
            return true;
          }
          if (event.key === "ArrowDown" && collapsed && caret === block.text.length && index < blocks.length - 1) {
            focusBlock(event, blocks[index + 1]!.id, 0);
            return true;
          }
          return false;
        }),
      /** Person: pick an item from the open menu. */
      pick: (id: string, event?: Event) => shown(() => pickMenu(String(id), event)),
      /** Person: tick or untick a to-do. */
      check: (id: string, event?: Event) =>
        shown(() => {
          writable();
          const actor = person("edit");
          const block = findBlock(doc(), id);
          const next = setBlocks(replace({ ...block, checked: !block.checked }), "check", event);
          if (next)
            audit({ action: "check", actor, blockId: id, detail: block.checked ? "unchecked" : "checked" }, next);
          return Boolean(next);
        }),
      /** Person: add an empty paragraph at the end, e.g. by clicking below the last block. */
      append: (event?: Event) =>
        shown(() => {
          writable();
          const last = doc().blocks.at(-1);
          if (last && last.type === "paragraph" && last.text === "") {
            focusBlock(event, last.id);
            return last.id;
          }
          if (!last) {
            const actor = person("edit");
            const id = newBlockId(doc());
            const next = setBlocks([{ id, type: "paragraph", text: "" }], "insert", event);
            if (next) audit({ action: "insert", actor, blockId: id }, next);
            return id;
          }
          const id = insertNew(last.id, { type: "paragraph", text: "" }, event);
          focusBlock(event, id, 0);
          return id;
        }),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({
        "data-readonly": state.locked ? "" : undefined,
        "data-proposals": state.proposals.length ? String(state.proposals.length) : undefined,
      }),
      state: (state) => ({
        document: state.document,
        proposals: state.document.proposals,
        menu: state.menu,
        items: state.items,
        locked: state.locked,
        refusal: state.refusal,
      }),
    }),
    // `value` is the block id.
    block: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => {
        const id = String(part.key);
        const block = state.document.blocks.find((item) => item.id === id);
        const open = state.menu?.blockId === id && state.items.length > 0;
        return {
          value: block?.text ?? "",
          rows: "1",
          spellcheck: "true",
          "aria-readonly": state.locked ? "true" : undefined,
          "data-block": id,
          "data-type": block?.type,
          "data-level": block?.level ? String(block.level) : undefined,
          "aria-autocomplete": "list",
          "aria-expanded": open ? "true" : "false",
          "aria-controls": open ? menuId(state.document.id, id) : undefined,
          "aria-activedescendant": open
            ? optionId(state.document.id, id, state.items[state.menu!.active]?.id ?? "")
            : undefined,
        };
      },
      on: {
        input: (event, { api, key }) => {
          const el = event.target as HTMLTextAreaElement;
          try {
            api.typed(String(key), el.value, el.selectionStart ?? el.value.length, event);
          } catch {
            /* shown in the control */
          }
        },
        keydown: (event, { api, key }) => {
          try {
            if (api.key(String(key), event as KeyboardEvent)) event.preventDefault();
          } catch {
            /* shown in the control */
          }
        },
        blur: (_event, { api, key }) => api.left(String(key)),
      },
      // Grow with the text where `field-sizing` is missing.
      bind: (el) => {
        const area = el as HTMLTextAreaElement;
        if (typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content")) return;
        const fit = () => {
          area.style.height = "auto";
          area.style.height = `${area.scrollHeight}px`;
        };
        fit();
        area.addEventListener("input", fit);
        return () => area.removeEventListener("input", fit);
      },
    }),
    // `value` is the block id of a to-do.
    check: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => {
        const block = state.document.blocks.find((item) => item.id === String(part.key));
        return {
          type: "checkbox",
          checked: block?.checked ? "" : undefined,
          "aria-readonly": state.locked ? "true" : undefined,
        };
      },
      on: {
        change: (event, { api, key }) => {
          try {
            api.check(String(key), event);
          } catch {
            /* shown in the control */
          }
        },
      },
    }),
    menu: slot({
      role: "listbox",
      keys: { none: "The block's text keeps focus and handles them." },
      present: (state) => Boolean(state.menu && state.items.length),
      attrs: (state) => ({ "data-kind": state.menu?.kind }),
    }),
    // `value` is the command or mention id.
    option: slot<{ value: string }>({
      props: { value: "string" },
      role: "option",
      focus: { none: "The block's text keeps focus; arrows move the active option." },
      keys: { none: "The block's text handles the keys." },
      attrs: (state, part) => {
        const active = state.items[state.menu?.active ?? -1]?.id === String(part.key);
        return { "aria-selected": active ? "true" : "false", "data-active": active ? "" : undefined };
      },
      on: {
        // Keep the caret in the block while the person clicks.
        mousedown: (event) => event.preventDefault(),
      },
      press: ({ api, key }, event) => {
        try {
          api.pick(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    // `value` is the proposal's `buttonKey`, e.g. "p1#accept".
    accept: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button", "data-agent-confirm": personOnly("Accepting a proposal needs a person") }),
      press: ({ api, key }, event) => {
        try {
          api.accept(recordOf(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    reject: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({
        type: "button",
        "data-variant": "secondary",
        "data-agent-confirm": personOnly("Rejecting a proposal needs a person"),
      }),
      press: ({ api, key }, event) => {
        try {
          api.reject(recordOf(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    add: slot({
      attrs: () => ({ type: "button", "data-variant": "ghost" }),
      press: ({ api }, event) => {
        try {
          api.append(event);
        } catch {
          /* shown in the control */
        }
      },
    }),
  }),
  agent: {
    actions: ["findBlocks", "insertBlock", "editBlock", "moveBlock", "removeBlock", "runCommand", "withdrawProposal"],
  },
});

export { BLOCK_TYPES };
export type { BlockType, DocBlock, DocProposal, EditorDocument, Mention };
