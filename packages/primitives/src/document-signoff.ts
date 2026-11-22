import {
  SIGNOFF_LEVELS,
  signDocument,
  signObstacles,
  signoffStates,
  withdrawSignature,
  type SignableDocument,
  type SignoffLevel,
  type SignoffMark,
} from "@booki/core/document-signoff";
import { BookiError, msg } from "@booki/core/msg";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { refuseDenied } from "./access.js";
import { recordOf } from "./fields.js";
import { personOnly } from "./person-only.js";

export { buttonKey } from "./fields.js";

export type Options = {
  document?: SignableDocument;
  defaultDocument?: SignableDocument;
  /** Id of the person at the keyboard, and their name for the signature. */
  actor?: string;
  actorName?: string;
  /** A person's methods their role does not allow, each with the reason. Set by `BookiAccessProvider`. */
  denied?: Record<string, string>;
  /** Characters a withdrawal reason needs. Default 20. */
  minReason?: number;
  onDocumentChange?: (
    document: SignableDocument,
    details: { reason: string; source?: string; cancel?: () => void },
  ) => void;
};

/** One level as the agent reads it. */
export type LevelView = {
  level: SignoffLevel;
  mark: SignoffMark;
  by?: string;
  at?: string;
  version?: number;
  openPoints?: string[];
};

export function derive(document: SignableDocument) {
  const obstacles = signObstacles(document).map((code) => msg(code, { id: document.id }));
  return {
    version: document.version,
    openPoints: document.openPoints,
    obstacles,
    signable: obstacles.length === 0,
    levels: signoffStates(document).map(
      ({ level, mark, signature }): LevelView => ({
        level,
        mark,
        ...(signature
          ? { by: signature.by, at: signature.at, version: signature.version, openPoints: signature.openPoints }
          : {}),
      }),
    ),
  };
}

const EMPTY: SignableDocument = { id: "", version: 0, saveState: "saved", openPoints: [], signatures: [] };

/**
 * The sign-off line that ends a document: performed, reviewed, approved, each
 * bound to the version signed. An agent reads every level, its mark ("changed
 * after sign-off", "basis changed") and what stops a signature, and may ask
 * `assertSignable`. Signing and withdrawing are a person's buttons, never
 * agent actions; open points never stop them, they go with the signature.
 */
export const documentSignoff = definePrimitive({
  name: "document-signoff",
  options: {
    document: "value",
    defaultDocument: "value",
    actor: "string",
    actorName: "string",
    denied: "value",
    minReason: "number",
    onDocumentChange: "callback",
  },
  controlled: ["version", "levels", "openPoints", "obstacles", "signable"],
  state: (options: Options) => {
    const document = options.document ?? options.defaultDocument ?? EMPTY;
    return { document, refusal: "", drafts: {} as Record<string, string>, ...derive(document) };
  },
  sync: (options: Options) =>
    options.document === undefined ? {} : { document: options.document, ...derive(options.document) },
  api: (context) => {
    const change = createChange(context);
    const now = () => new Date().toISOString();
    const commit = (next: SignableDocument, reason: string, event?: Event) => {
      const ok = change("document", next, { reason, event });
      if (ok && context.options().document === undefined) context.store.set({ refusal: "", ...derive(next) });
      else if (ok) context.store.set({ refusal: "" });
      return ok;
    };
    const level = (raw: unknown): SignoffLevel => {
      const value = String(raw) as SignoffLevel;
      if (!SIGNOFF_LEVELS.includes(value)) {
        throw new BookiError("signoff.unknown-level", { level: String(raw), levels: SIGNOFF_LEVELS.join(", ") });
      }
      return value;
    };
    const shown = <T>(run: () => T): T => {
      try {
        return run();
      } catch (error) {
        context.store.set({ refusal: (error as Error).message });
        throw error;
      }
    };
    const person = () => {
      const actor = String(context.options().actor ?? "").trim();
      if (actor === "") throw new BookiError("permissions.signed-out", { permission: "audit.sign-off" });
      return actor;
    };
    return {
      /** Agent: throws with what stops a signature now (technical facts only); open points do not. */
      assertSignable: () => {
        const [first] = signObstacles(context.store.get().document);
        if (first) throw new BookiError(first, { id: context.store.get().document.id });
        return { signable: true, openPoints: context.store.get().document.openPoints.length };
      },
      // Everything below is for a person. It is not in `agent.actions`, so the
      // bridge refuses a step that names it.
      /** Person only: sign a level on the version shown. */
      sign: (raw: string, event?: Event) =>
        shown(() => {
          const which = level(raw);
          refuseDenied(context.options(), `sign-${which}`);
          const name = context.options().actorName;
          return commit(
            signDocument(context.store.get().document, which, { id: person(), ...(name ? { name } : {}) }, now()),
            `sign-${which}`,
            event,
          );
        }),
      /** Hold the withdrawal reason being typed. Not reported to the bridge. */
      setReason: (raw: string, text: string) => {
        context.store.set({ drafts: { ...context.store.get().drafts, [String(raw)]: String(text ?? "") } });
      },
      /** Person only: withdraw a level, and those resting on it, with the reason typed for it. */
      withdraw: (raw: string, event?: Event) =>
        shown(() => {
          const which = level(raw);
          refuseDenied(context.options(), `withdraw-${which}`);
          const { [which]: reason = "", ...rest } = context.store.get().drafts;
          const ok = commit(
            withdrawSignature(context.store.get().document, which, person(), now(), reason, {
              minReason: context.options().minReason,
            }),
            `withdraw-${which}`,
            event,
          );
          if (ok) context.store.set({ drafts: rest });
          return ok;
        }),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      state: (state) => ({
        document: state.document,
        levels: state.levels,
        obstacles: state.obstacles,
        drafts: state.drafts,
        refusal: state.refusal,
      }),
    }),
    // `value` is the level's `buttonKey`, e.g. "reviewed#sign", so the mark guards this button only.
    sign: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button", "data-agent-confirm": personOnly("Signing needs a person") }),
      press: ({ api, key }, event) => {
        try {
          api.sign(recordOf(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    reason: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({ value: state.drafts[String(part.key)] ?? "" }),
      on: {
        input: (event, { api, key }) => {
          api.setReason(String(key), (event.target as HTMLTextAreaElement).value);
        },
      },
    }),
    withdraw: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({
        type: "button",
        "data-variant": "secondary",
        "data-agent-confirm": personOnly("Withdrawing a signature needs a person"),
      }),
      press: ({ api, key }, event) => {
        try {
          api.withdraw(recordOf(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
  }),
  agent: { actions: ["assertSignable"] },
});
