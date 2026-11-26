import {
  approvalState,
  assertApproved,
  decide,
  type ApprovalDecision,
  type ApprovalLevel,
  type ApprovalRequest,
} from "@booki-aui/core/approval";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { refuseDenied } from "./access.js";
import { personOnly } from "./person-only.js";

export type Options = {
  chain?: ApprovalLevel[];
  request?: ApprovalRequest;
  defaultRequest?: ApprovalRequest;
  /** Id of the person at the keyboard. Decisions are recorded as theirs. */
  actor?: string;
  /** A person's methods their role does not allow, each with the reason. Set by `BookiAccessProvider`. */
  denied?: Record<string, string>;
  onRequestChange?: (
    request: ApprovalRequest,
    details: { reason: string; source?: string; cancel?: () => void },
  ) => void;
};

export const EMPTY: ApprovalRequest = { id: "", amountMinor: 0, requesterId: "", decisions: [] };

export function derive(chain: ApprovalLevel[], request: ApprovalRequest) {
  if (chain.length === 0) {
    return { status: "pending" as const, currentLevel: undefined, mayDecide: [] as string[], locked: true };
  }
  const state = approvalState(chain, request);
  return {
    status: state.status,
    currentLevel: state.current?.name,
    mayDecide: state.mayDecide,
    locked: state.locked,
  };
}

/**
 * A multi-level approval an agent can read but never decide. The snapshot
 * says where the request stands, who may decide now and whether the item is
 * locked. Approve, reject and escalate are a person's buttons: they are not
 * agent actions, and each is checked against the chain (the requester cannot
 * approve, limits must cover the amount, each level needs a different person).
 */
export const approvalChain = definePrimitive({
  name: "approval-chain",
  options: {
    chain: "value",
    request: "value",
    defaultRequest: "value",
    actor: "value",
    denied: "value",
    onRequestChange: "callback",
  },
  controlled: ["request", "status", "currentLevel", "mayDecide", "locked"],
  state: (options: Options) => {
    const chain = options.chain ?? [];
    const request = options.request ?? options.defaultRequest ?? EMPTY;
    return { chain, request, refusal: "", ...derive(chain, request) };
  },
  sync: (options: Options) =>
    options.request === undefined ? {} : { request: options.request, ...derive(options.chain ?? [], options.request) },
  api: (context) => {
    const change = createChange(context);
    const chain = () => context.options().chain ?? [];

    context.onOptions(() => {
      const next = chain();
      context.store.set({ chain: next, ...derive(next, context.store.get().request) });
    });

    function person(decision: ApprovalDecision["decision"], event?: Event, note?: string) {
      const actor = String(context.options().actor ?? "").trim();
      try {
        refuseDenied(context.options(), "decide");
        if (actor === "") {
          throw new Error("Nobody is signed in to decide. Pass `actor` with the person's id.");
        }
        const next = decide(chain(), context.store.get().request, {
          approverId: actor,
          decision,
          at: new Date().toISOString(),
          note,
        });
        const ok = change("request", next, { reason: decision, event });
        if (ok) context.store.set({ refusal: "", ...derive(chain(), next) });
        return ok;
      } catch (error) {
        // A person sees the refusal next to the buttons.
        context.store.set({ refusal: (error as Error).message });
        throw error;
      }
    }

    return {
      /** Person only. */
      approve: (event?: Event, note?: string) => person("approved", event, note),
      /** Person only. */
      reject: (event?: Event, note?: string) => person("rejected", event, note),
      /** Person only. */
      escalate: (event?: Event, note?: string) => person("escalated", event, note),
      /** Agent: throws unless every required level has approved. */
      assertApproved: () => {
        const state = assertApproved(chain(), context.store.get().request);
        return { status: state.status };
      },
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({ "data-status": state.status }),
      state: (state) => ({
        request: state.request,
        refusal: state.refusal,
        approval: state.chain.length > 0 ? approvalState(state.chain, state.request) : undefined,
      }),
    }),
    approve: slot({
      attrs: () => ({ type: "button", "data-person-only": personOnly("Approving needs a person") }),
      press: ({ api }, event) => {
        try {
          api.approve(event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    reject: slot({
      attrs: () => ({
        type: "button",
        "data-variant": "secondary",
        "data-person-only": personOnly("Rejecting needs a person"),
      }),
      press: ({ api }, event) => {
        try {
          api.reject(event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    escalate: slot({
      attrs: () => ({
        type: "button",
        "data-variant": "secondary",
        "data-person-only": personOnly("Escalating needs a person"),
      }),
      press: ({ api }, event) => {
        try {
          api.escalate(event);
        } catch {
          /* shown in the control */
        }
      },
    }),
  }),
  agent: { actions: ["assertApproved"] },
});
