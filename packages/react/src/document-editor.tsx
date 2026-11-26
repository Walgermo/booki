import type {
  BlockRef,
  BlockType,
  DocBlock,
  DocProposal,
  EditorDocument,
  Mention,
} from "@booki-aui/core/document-blocks";
import type { BookiChangeDetails } from "./change-details.js";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import { Fragment, type ReactNode } from "react";
import { useAccessFor } from "./access.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import {
  buttonKey,
  documentEditor,
  menuId,
  optionId,
  DEFAULT_COMMANDS,
  type DocumentAuditEvent,
  type MenuItem,
  type SlashCommand,
} from "@booki-aui/primitives/document-editor";

const TAGS = {
  root: "div",
  block: "textarea",
  check: "input",
  menu: "div",
  option: "div",
  accept: "button",
  reject: "button",
  add: "button",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof documentEditor, typeof TAGS> = createParts(documentEditor, TAGS);
const DocumentEditorRoot: (typeof parts)["Root"] = parts.Root;
const DocumentEditorBlock: (typeof parts)["Block"] = parts.Block;
const DocumentEditorCheck: (typeof parts)["Check"] = parts.Check;
const DocumentEditorMenu: (typeof parts)["Menu"] = parts.Menu;
const DocumentEditorOption: (typeof parts)["Option"] = parts.Option;
const DocumentEditorAccept: (typeof parts)["Accept"] = parts.Accept;
const DocumentEditorReject: (typeof parts)["Reject"] = parts.Reject;
const DocumentEditorAdd: (typeof parts)["Add"] = parts.Add;

const COPY = {
  EN: {
    label: "Document",
    placeholder: "Type, or press / for commands and @ to mention",
    empty: "Nothing on the page yet.",
    add: "Add a block",
    agent: "Agent",
    proposes: {
      insert: "proposes new text",
      edit: "proposes a change",
      move: "proposes a move",
      remove: "proposes removing this",
    },
    after: "after",
    top: "to the top",
    was: "Was",
    becomes: "Becomes",
    accept: "Accept",
    reject: "Reject",
    waiting: (n: number) => (n === 1 ? "1 proposal waits for you" : `${n} proposals wait for you`),
    type: {
      paragraph: "Text",
      heading: "Heading",
      bullet: "Bullet",
      numbered: "Numbered",
      todo: "To-do",
      quote: "Quote",
      callout: "Callout",
      divider: "Divider",
      embed: "Embedded content",
    } satisfies Record<BlockType, string>,
    kind: { file: "File", evidence: "Evidence", person: "Person", page: "Page" } satisfies Record<
      Mention["kind"],
      string
    >,
    commands: {
      text: "Text",
      heading1: "Heading 1",
      heading2: "Heading 2",
      heading3: "Heading 3",
      bullet: "Bulleted list",
      numbered: "Numbered list",
      todo: "To-do",
      quote: "Quote",
      callout: "Callout",
      divider: "Divider",
    } as Record<string, string>,
    blocksGroup: "Blocks",
    commandList: "Commands",
    mentionList: "Mentions",
  },
  NO: {
    label: "Dokument",
    placeholder: "Skriv, eller trykk / for kommandoer og @ for å nevne",
    empty: "Ingenting på siden ennå.",
    add: "Legg til en blokk",
    agent: "Agent",
    proposes: {
      insert: "foreslår ny tekst",
      edit: "foreslår en endring",
      move: "foreslår å flytte",
      remove: "foreslår å fjerne dette",
    },
    after: "etter",
    top: "øverst",
    was: "Var",
    becomes: "Blir",
    accept: "Godta",
    reject: "Avvis",
    waiting: (n: number) => (n === 1 ? "1 forslag venter på deg" : `${n} forslag venter på deg`),
    type: {
      paragraph: "Tekst",
      heading: "Overskrift",
      bullet: "Punkt",
      numbered: "Nummerert",
      todo: "Oppgave",
      quote: "Sitat",
      callout: "Merknad",
      divider: "Skillelinje",
      embed: "Innebygd innhold",
    } satisfies Record<BlockType, string>,
    kind: { file: "Fil", evidence: "Bilag", person: "Person", page: "Side" } satisfies Record<Mention["kind"], string>,
    commands: {
      text: "Tekst",
      heading1: "Overskrift 1",
      heading2: "Overskrift 2",
      heading3: "Overskrift 3",
      bullet: "Punktliste",
      numbered: "Nummerert liste",
      todo: "Oppgave",
      quote: "Sitat",
      callout: "Merknad",
      divider: "Skillelinje",
    } as Record<string, string>,
    blocksGroup: "Blokker",
    commandList: "Kommandoer",
    mentionList: "Omtaler",
  },
} as const;

export type DocumentEditorProps = {
  document?: EditorDocument;
  defaultDocument?: EditorDocument;
  onDocumentChange?: (document: EditorDocument, details: BookiChangeDetails) => void;
  /** The waiting proposals, when the app stores them (so they outlive the page). Pass back what `onProposalsChange` gave. */
  proposals?: DocProposal[];
  defaultProposals?: DocProposal[];
  onProposalsChange?: (proposals: DocProposal[], details: { reason: string }) => void;
  /** The "/" commands. Default: the block types in the reader's language. Add yours with `[...defaultCommands, …]`. */
  commands?: SlashCommand[];
  /** What "@" can mention: files, evidence, people and pages from the app. */
  mentions?: Mention[];
  /** Id of the person at the keyboard. */
  actor?: string;
  /** The agent's id in proposals: `agent:<agentId>`. Default "agent". */
  agentId?: string;
  readOnly?: boolean;
  /** At most one proposal waits at a time. */
  onePending?: boolean;
  /** One row per change, for the app's audit trail. */
  onAudit?: (event: DocumentAuditEvent) => void;
  /** Runs the app's own commands (those without `type` or `blocks`) for a person. */
  onCommand?: (id: string, details: { blockId: string }) => void;
  /** Who an actor id is, for the proposal line. */
  nameOf?: (actor: string) => ReactNode;
  /** Draw an embed (the app's table, figure or data node) read-only. Default: its words in a quiet box. */
  renderEmbed?: (block: DocBlock) => ReactNode;
  /** Draw a mention in a block's chips, e.g. as a link to the file. */
  renderMention?: (ref: BlockRef) => ReactNode;
  className?: string;
  "aria-label"?: string;
};

type RootState = {
  document: EditorDocument;
  proposals: DocProposal[];
  menu: { kind: "slash" | "mention"; blockId: string; query: string; active: number } | null;
  items: MenuItem[];
  locked: boolean;
  refusal: string;
};

/** The default "/" commands in the reader's language. */
export function useDefaultCommands(): SlashCommand[] {
  const { country } = useBookiLocaleOptional();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  return DEFAULT_COMMANDS.map((command) => ({
    ...command,
    label: copy.commands[command.id] ?? command.label,
    group: copy.blocksGroup,
  }));
}

/** Text with each "@Label" of a ref drawn as a chip. */
function withChips(text: string, refs: BlockRef[] | undefined, render: (ref: BlockRef) => ReactNode): ReactNode[] {
  if (!refs?.length) return [text];
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest) {
    const hit = refs
      .map((ref) => ({ ref, at: rest.indexOf(`@${ref.label}`) }))
      .filter((item) => item.at >= 0)
      .sort((a, b) => a.at - b.at)[0];
    if (!hit) {
      out.push(rest);
      break;
    }
    if (hit.at > 0) out.push(rest.slice(0, hit.at));
    out.push(<Fragment key={n++}>{render(hit.ref)}</Fragment>);
    rest = rest.slice(hit.at + hit.ref.label.length + 1);
  }
  return out;
}

/**
 * A block editor for working papers. "/" opens commands, "@" mentions files,
 * evidence, people and pages the app passes. An agent reads the page as
 * blocks and proposes: each proposal shows in the agent's colour and waits for
 * a person's Accept or Reject. Every change reaches `onAudit`.
 */
function DocumentEditor({
  document,
  defaultDocument,
  onDocumentChange,
  proposals,
  defaultProposals,
  onProposalsChange,
  commands,
  mentions,
  actor,
  agentId,
  readOnly,
  onePending,
  onAudit,
  onCommand,
  nameOf = (id) => (id.startsWith("agent") ? null : id),
  renderMention,
  renderEmbed,
  className,
  "aria-label": ariaLabel,
}: DocumentEditorProps) {
  const { country } = useBookiLocaleOptional();
  const say = useSay();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const defaults = useDefaultCommands();
  const access = useAccessFor({ edit: "audit.prepare", accept: "audit.prepare", reject: "audit.prepare" }, actor);
  const chip =
    renderMention ??
    ((ref: BlockRef) => (
      <span data-slot="document-editor-mention" data-kind={ref.kind} title={`${copy.kind[ref.kind]}: ${ref.label}`}>
        @{ref.label}
      </span>
    ));

  return (
    <DocumentEditorRoot
      document={document}
      defaultDocument={defaultDocument}
      onDocumentChange={onDocumentChange}
      proposals={proposals}
      defaultProposals={defaultProposals}
      onProposalsChange={onProposalsChange}
      commands={commands ?? defaults}
      mentions={mentions}
      actor={access.actor}
      agentId={agentId}
      readOnly={readOnly}
      onePending={onePending}
      denied={access.denied}
      onAudit={onAudit}
      onCommand={onCommand}
      className={className}
      aria-label={ariaLabel ?? copy.label}
    >
      {(state: RootState) => {
        const doc = state.document;
        const byBlock = new Map(state.proposals.filter((p) => p.op !== "insert").map((p) => [p.blockId, p]));
        const insertsAfter = (id: string | null) =>
          state.proposals.filter((p) => p.op === "insert" && (p.after ?? null) === id);
        const titleOf = (id: string | null | undefined) => {
          if (!id) return copy.top;
          const block = doc.blocks.find((item) => item.id === id);
          const text = block?.text.trim() || (block ? copy.type[block.type] : id);
          return `${copy.after} “${text.length > 40 ? `${text.slice(0, 39)}…` : text}”`;
        };
        const who = (by: string) => {
          const name = nameOf(by);
          return name ? (
            <>
              {copy.agent} · {name}
            </>
          ) : (
            copy.agent
          );
        };
        const decide = (proposal: DocProposal, label: string) =>
          state.locked ? null : (
            <div data-slot="document-editor-decide">
              <DocumentEditorAccept value={buttonKey(proposal.id, "accept")} aria-label={`${copy.accept}: ${label}`}>
                {copy.accept}
              </DocumentEditorAccept>
              <DocumentEditorReject value={buttonKey(proposal.id, "reject")} aria-label={`${copy.reject}: ${label}`}>
                {copy.reject}
              </DocumentEditorReject>
            </div>
          );
        const ghost = (block: DocBlock) => (
          <div key={block.id} data-slot="document-editor-ghost" data-type={block.type} data-level={block.level}>
            {block.type === "divider" ? <hr /> : withChips(block.text, block.refs, chip)}
          </div>
        );
        const insertCards = (after: string | null) =>
          insertsAfter(after).map((proposal) => (
            <div key={proposal.id} data-slot="document-editor-proposal" data-op="insert" data-proposal={proposal.id}>
              <p data-slot="document-editor-proposal-head">
                <span data-slot="document-editor-agent">{who(proposal.by)}</span> {copy.proposes.insert}
                {proposal.reason ? <span data-slot="document-editor-reason">{proposal.reason}</span> : null}
              </p>
              <div data-slot="document-editor-ghosts">{(proposal.blocks ?? []).map(ghost)}</div>
              {decide(proposal, `${copy.proposes.insert} (${proposal.id})`)}
            </div>
          ));
        let number = 0;
        return (
          <>
            {state.proposals.length ? (
              <p data-slot="document-editor-status" role="status">
                {copy.waiting(state.proposals.length)}
              </p>
            ) : null}
            <div data-slot="document-editor-blocks">
              {insertCards(null)}
              {doc.blocks.length === 0 && state.proposals.length === 0 ? (
                <p data-slot="document-editor-empty">{copy.empty}</p>
              ) : null}
              {doc.blocks.map((block, index) => {
                number = block.type === "numbered" ? number + 1 : 0;
                const proposal = byBlock.get(block.id);
                const open = state.menu?.blockId === block.id && state.items.length > 0;
                const label = `${copy.type[block.type]} ${index + 1}`;
                return (
                  <Fragment key={block.id}>
                    <div
                      data-slot="document-editor-row"
                      data-type={block.type}
                      data-level={block.level}
                      data-proposal={proposal?.op}
                      data-agent={block.origin ? "" : undefined}
                    >
                      {block.type === "bullet" ? <span data-slot="document-editor-marker" aria-hidden="true" /> : null}
                      {block.type === "numbered" ? (
                        <span data-slot="document-editor-marker" aria-hidden="true">
                          {number}.
                        </span>
                      ) : null}
                      {block.type === "todo" ? (
                        <DocumentEditorCheck
                          value={block.id}
                          aria-label={`${copy.type.todo}: ${block.text || index + 1}`}
                        />
                      ) : null}
                      {block.type === "divider" ? (
                        <hr data-slot="document-editor-divider" />
                      ) : block.type === "embed" ? (
                        <div data-slot="document-editor-embed" aria-label={label}>
                          {renderEmbed ? renderEmbed(block) : block.text || copy.type.embed}
                        </div>
                      ) : (
                        <DocumentEditorBlock value={block.id} aria-label={label} placeholder={copy.placeholder} />
                      )}
                      {block.refs?.length ? (
                        <span data-slot="document-editor-refs">
                          {block.refs.map((ref) => (
                            <Fragment key={ref.id}>{chip(ref)}</Fragment>
                          ))}
                        </span>
                      ) : null}
                    </div>
                    {open ? (
                      <DocumentEditorMenu
                        id={menuId(doc.id, block.id)}
                        aria-label={state.menu?.kind === "slash" ? copy.commandList : copy.mentionList}
                      >
                        {state.items.map((item, i) => {
                          const group = item.group && item.group !== state.items[i - 1]?.group ? item.group : null;
                          return (
                            <Fragment key={item.id}>
                              {group ? (
                                <p data-slot="document-editor-group" aria-hidden="true">
                                  {group}
                                </p>
                              ) : null}
                              <DocumentEditorOption id={optionId(doc.id, block.id, item.id)} value={item.id}>
                                <span data-slot="document-editor-option-label">{item.label}</span>
                                {item.kind ? (
                                  <span data-slot="document-editor-option-kind">
                                    {copy.kind[item.kind as Mention["kind"]] ?? item.kind}
                                  </span>
                                ) : null}
                                {item.hint ? <span data-slot="document-editor-option-hint">{item.hint}</span> : null}
                              </DocumentEditorOption>
                            </Fragment>
                          );
                        })}
                      </DocumentEditorMenu>
                    ) : null}
                    {proposal ? (
                      <div data-slot="document-editor-proposal" data-op={proposal.op} data-proposal={proposal.id}>
                        <p data-slot="document-editor-proposal-head">
                          <span data-slot="document-editor-agent">{who(proposal.by)}</span> {copy.proposes[proposal.op]}
                          {proposal.op === "move" ? ` ${titleOf(proposal.after)}` : ""}
                          {proposal.reason ? <span data-slot="document-editor-reason">{proposal.reason}</span> : null}
                        </p>
                        {proposal.op === "edit" && proposal.block ? (
                          <div data-slot="document-editor-diff">
                            <div data-slot="document-editor-was">
                              <span data-slot="document-editor-diff-label">{copy.was}</span>
                              <del>{proposal.before?.text || copy.type[proposal.before?.type ?? "paragraph"]}</del>
                            </div>
                            <div data-slot="document-editor-becomes">
                              <span data-slot="document-editor-diff-label">{copy.becomes}</span>
                              {ghost(proposal.block)}
                            </div>
                          </div>
                        ) : null}
                        {decide(proposal, `${copy.proposes[proposal.op]} (${proposal.id})`)}
                      </div>
                    ) : null}
                    {insertCards(block.id)}
                  </Fragment>
                );
              })}
            </div>
            {state.locked ? null : <DocumentEditorAdd aria-label={copy.add}>+ {copy.add}</DocumentEditorAdd>}
            {state.refusal ? (
              <p data-slot="document-editor-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </DocumentEditorRoot>
  );
}

export {
  DocumentEditor,
  DocumentEditorAccept,
  DocumentEditorAdd,
  DocumentEditorBlock,
  DocumentEditorCheck,
  DocumentEditorMenu,
  DocumentEditorOption,
  DocumentEditorReject,
  DocumentEditorRoot,
  documentEditor,
};
export type { BlockRef, BlockType, DocBlock, DocProposal, DocumentAuditEvent, EditorDocument, Mention, SlashCommand };
