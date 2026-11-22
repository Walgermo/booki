import {
  assertEvidenced,
  linkAttachment,
  missingKinds,
  removeAttachment,
  setAttachmentKind,
  type Attachment,
  type AttachmentFile,
  type AttachmentKind,
} from "@booki/core/attachments";
import { BookiError } from "@booki/core/msg";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { refuseDenied } from "./access.js";

export type Options = {
  attachments?: Attachment[];
  defaultAttachments?: Attachment[];
  /** Files the host knows about that can be linked. Metadata only: no bytes are read here. */
  pool?: AttachmentFile[];
  /** Kinds of evidence the entry must have, e.g. ["receipt"]. */
  requires?: AttachmentKind[];
  /** The entry is posted or closed: nothing can be removed or reclassified. */
  locked?: boolean;
  /** Id of the person at the keyboard. */
  actor?: string;
  /** Person's methods their role does not allow, with the reason. Filled by `BookiAccessProvider`. */
  denied?: Record<string, string>;
  /** Recorded as `addedBy` on what an agent links. Defaults to "agent". */
  agentActor?: string;
  onAttachmentsChange?: (
    attachments: Attachment[],
    details: { reason: string; source?: string; cancel?: () => void },
  ) => void;
};

export function derive(attachments: Attachment[], options: Options) {
  const linked = new Set(attachments.map((item) => item.id));
  const missing = missingKinds(attachments, options.requires ?? []);
  return {
    available: (options.pool ?? []).filter((file) => !linked.has(file.id)),
    missing,
    evidenced: missing.length === 0,
  };
}

/**
 * The evidence on one entry (voucher, invoice, claim). An agent sees what is
 * linked, which files could be, and which required kinds are missing; it may
 * link a file from the pool, set a kind and ask `assertEvidenced`. Removing is
 * a person's button, not an agent action, and is refused on a locked entry.
 * The control never uploads or reads a file: the host supplies the metadata.
 */
export const evidenceList = definePrimitive({
  name: "evidence-list",
  options: {
    attachments: "value",
    defaultAttachments: "value",
    pool: "value",
    requires: "value",
    locked: "boolean",
    actor: "string",
    denied: "value",
    agentActor: "string",
    onAttachmentsChange: "callback",
  },
  controlled: ["attachments", "available", "missing", "evidenced"],
  state: (options: Options) => {
    const attachments = options.attachments ?? options.defaultAttachments ?? [];
    return { attachments, locked: Boolean(options.locked), refusal: "", ...derive(attachments, options) };
  },
  sync: (options: Options) =>
    options.attachments === undefined
      ? {}
      : { attachments: options.attachments, ...derive(options.attachments, options) },
  api: (context) => {
    const change = createChange(context);
    // A new pool or new requirements change what is available and missing.
    context.onOptions(() => {
      const state = context.store.get();
      const options = context.options();
      const next = derive(state.attachments, options);
      const sign = (d: { available: AttachmentFile[]; missing: string[] }) =>
        `${d.available.map((file) => file.id).join("\n")}\n\n${d.missing.join("\n")}`;
      if (sign(next) !== sign(state)) context.store.set(next);
      if (Boolean(options.locked) !== state.locked) context.store.set({ locked: Boolean(options.locked) });
    });
    const commit = (next: Attachment[], reason: string, event?: Event) => {
      const ok = change("attachments", next, { reason, event });
      if (ok) context.store.set({ refusal: "", ...derive(next, context.options()) });
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
    /** A person's button their role does not allow is refused before it runs. */
    const gated = <T>(method: string, run: () => T): T =>
      shown(() => {
        refuseDenied(context.options(), method);
        return run();
      });
    const person = () => {
      const actor = String(context.options().actor ?? "").trim();
      if (actor === "") throw new Error("Nobody is signed in. Pass `actor` with the person's id.");
      return actor;
    };
    function link(id: string, kind: AttachmentKind | undefined, by: string, event?: Event) {
      const { attachments, available } = context.store.get();
      const file = available.find((item) => item.id === String(id));
      if (!file) {
        throw attachments.some((item) => item.id === String(id))
          ? new BookiError("attachment.already-linked", { id: String(id) })
          : new BookiError("attachment.no-file", {
              id: String(id),
              ids: available.map((item) => item.id).join(", ") || "none",
            });
      }
      return commit(linkAttachment(attachments, file, kind, by, new Date().toISOString()), "link-attachment", event);
    }
    const kind = (id: string, next: AttachmentKind, event?: Event) =>
      commit(
        setAttachmentKind(context.store.get().attachments, id, next, Boolean(context.options().locked)),
        "set-kind",
        event,
      );
    return {
      /** Agent: link a file from the pool. Without a kind, the file's own or "other". */
      linkAttachment: (attachmentId: string, as?: AttachmentKind) =>
        link(attachmentId, as, context.options().agentActor ?? "agent"),
      /** Agent: say what a linked attachment is. */
      setKind: (attachmentId: string, next: AttachmentKind) => kind(attachmentId, next),
      /** Agent: throws naming the required kinds that are missing. */
      assertEvidenced: () => {
        assertEvidenced(context.store.get().attachments, context.options().requires ?? []);
        return { evidenced: true };
      },
      // Everything below is for a person. It is not in `agent.actions`, so the
      // bridge refuses a step that names it.
      linkByPerson: (attachmentId: string, event?: Event) =>
        shown(() => link(attachmentId, undefined, person(), event)),
      pickKind: (attachmentId: string, next: string, event?: Event) =>
        shown(() => kind(attachmentId, next as AttachmentKind, event)),
      /** Person only. Refused on a locked entry. */
      remove: (attachmentId: string, event?: Event) =>
        gated("remove", () =>
          commit(
            removeAttachment(context.store.get().attachments, attachmentId, Boolean(context.options().locked)),
            "remove-attachment",
            event,
          ),
        ),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({
        "data-evidenced": state.evidenced ? "" : undefined,
        "data-locked": state.locked ? "" : undefined,
      }),
      state: (state) => ({
        attachments: state.attachments,
        available: state.available,
        missing: state.missing,
        evidenced: state.evidenced,
        locked: state.locked,
        refusal: state.refusal,
      }),
    }),
    // `value` is the id of a file in the pool.
    link: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button", "data-variant": "secondary" }),
      press: ({ api, key }, event) => {
        try {
          api.linkByPerson(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    // `value` is the id of a linked attachment.
    kind: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        value: state.attachments.find((item) => item.id === String(part.key))?.kind ?? "other",
      }),
      on: {
        // "input" is the adapter's name for React's onChange.
        input: (event, { api, key }) => {
          try {
            api.pickKind(String(key), (event.target as HTMLSelectElement).value, event);
          } catch {
            /* shown in the control */
          }
        },
      },
    }),
    remove: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button", "data-variant": "secondary" }),
      press: ({ api, key }, event) => {
        try {
          api.remove(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
  }),
  agent: { actions: ["linkAttachment", "setKind", "assertEvidenced"] },
});
