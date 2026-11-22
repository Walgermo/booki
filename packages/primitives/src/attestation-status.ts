import { createChange, definePrimitive } from "@ui-sdk/core";
import { BookiError } from "@booki/core/msg";
import { personOnly } from "./person-only.js";

export type AttestationStatusValue = "pending" | "approved" | "rejected" | "escalated";

export type AgentItem = { value: string; label: string };

export type AttestationStatusOptions = {
  value?: AttestationStatusValue;
  defaultValue?: AttestationStatusValue;
  label?: string;
  pendingLabel?: string;
  approvedLabel?: string;
  rejectedLabel?: string;
  escalatedLabel?: string;
  onValueChange?: (value: AttestationStatusValue) => void;
  onApprove?: () => void;
  onReject?: () => void;
  onEscalate?: () => void;
};

export type AttestationStatusState = {
  value: AttestationStatusValue;
  statusLabel: string;
  items: AgentItem[];
  label: string;
  pendingLabel: string;
  approvedLabel: string;
  rejectedLabel: string;
  escalatedLabel: string;
};

export function statusLabelFor(
  value: AttestationStatusValue,
  labels: Pick<AttestationStatusState, "pendingLabel" | "approvedLabel" | "rejectedLabel" | "escalatedLabel">,
): string {
  switch (value) {
    case "pending":
      return labels.pendingLabel;
    case "approved":
      return labels.approvedLabel;
    case "rejected":
      return labels.rejectedLabel;
    case "escalated":
      return labels.escalatedLabel;
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
}

export function toItems(
  labels: Pick<AttestationStatusState, "pendingLabel" | "approvedLabel" | "rejectedLabel" | "escalatedLabel">,
): AgentItem[] {
  return (["pending", "approved", "rejected", "escalated"] as const).map((value) => ({
    value,
    label: statusLabelFor(value, labels),
  }));
}

/**
 * Attestation / approval status for invoices and vouchers.
 * approve / reject / escalate are confirm-gated irreversible steps.
 */
export const attestationStatus = definePrimitive({
  name: "attestation-status",
  options: {
    value: "string",
    defaultValue: "string",
    label: "string",
    pendingLabel: "string",
    approvedLabel: "string",
    rejectedLabel: "string",
    escalatedLabel: "string",
    onValueChange: "callback",
    onApprove: "callback",
    onReject: "callback",
    onEscalate: "callback",
  },
  controlled: ["value", "statusLabel", "items"],
  state: (options: AttestationStatusOptions): AttestationStatusState => {
    const pendingLabel = options.pendingLabel ?? "Pending";
    const approvedLabel = options.approvedLabel ?? "Approved";
    const rejectedLabel = options.rejectedLabel ?? "Rejected";
    const escalatedLabel = options.escalatedLabel ?? "Escalated";
    const labels = {
      pendingLabel,
      approvedLabel,
      rejectedLabel,
      escalatedLabel,
    };
    const value = options.value ?? options.defaultValue ?? ("pending" as const);
    return {
      value,
      statusLabel: statusLabelFor(value, labels),
      items: toItems(labels),
      label: options.label ?? "Attestation",
      ...labels,
    };
  },
  sync: (options: AttestationStatusOptions): Partial<AttestationStatusState> => {
    const partial: Partial<AttestationStatusState> = {};
    if (options.label !== undefined) partial.label = options.label;
    if (options.pendingLabel !== undefined) {
      partial.pendingLabel = options.pendingLabel;
    }
    if (options.approvedLabel !== undefined) {
      partial.approvedLabel = options.approvedLabel;
    }
    if (options.rejectedLabel !== undefined) {
      partial.rejectedLabel = options.rejectedLabel;
    }
    if (options.escalatedLabel !== undefined) {
      partial.escalatedLabel = options.escalatedLabel;
    }
    if (
      options.pendingLabel !== undefined ||
      options.approvedLabel !== undefined ||
      options.rejectedLabel !== undefined ||
      options.escalatedLabel !== undefined
    ) {
      const labels = {
        pendingLabel: options.pendingLabel ?? "Pending",
        approvedLabel: options.approvedLabel ?? "Approved",
        rejectedLabel: options.rejectedLabel ?? "Rejected",
        escalatedLabel: options.escalatedLabel ?? "Escalated",
      };
      partial.items = toItems(labels);
      if (options.value) {
        partial.statusLabel = statusLabelFor(options.value, labels);
      }
    }
    if (options.value !== undefined) {
      partial.value = options.value;
    }
    return partial;
  },
  api: (context) => {
    const change = createChange(context);

    function apply(value: AttestationStatusValue, reason: string) {
      const state = context.store.get();
      const ok = change("value", value, { reason });
      if (!ok) return false;
      context.store.set({
        statusLabel: statusLabelFor(value, state),
      });
      context.options().onValueChange?.(value);
      return true;
    }

    return {
      setStatus: (raw: string) => {
        const text = String(raw).trim().toLowerCase();
        const { items } = context.store.get();
        const match = items.find((i) => i.value === text || i.label.toLowerCase() === text);
        if (!match) {
          throw new BookiError("select.unknown-attestation", {
            value: String(raw),
            items: items.map((i) => i.value).join(", "),
          });
        }
        // Approving, rejecting and escalating are a person's decisions, and so is
        // undoing one: setStatus never moves an attestation in or out of a decided state.
        const current = context.store.get().value;
        if (match.value !== "pending" || current !== "pending") {
          throw new BookiError("attestation.person-only", { status: match.value });
        }
        return apply(match.value as AttestationStatusValue, "set-status");
      },
      approve: () => {
        const ok = apply("approved", "approve");
        if (ok) context.options().onApprove?.();
        return ok;
      },
      reject: () => {
        const ok = apply("rejected", "reject");
        if (ok) context.options().onReject?.();
        return ok;
      },
      escalate: () => {
        const ok = apply("escalated", "escalate");
        if (ok) context.options().onEscalate?.();
        return ok;
      },
      allItems: () => context.store.get().items,
    };
  },
  slots: (slot) => ({
    root: slot({
      attrs: (state) => ({
        "data-slot": "attestation-status",
        "data-status": state.value,
        "aria-label": state.label,
      }),
    }),
    badge: slot({
      attrs: (state) => ({
        "data-slot": "attestation-status-badge",
        "data-status": state.value,
      }),
    }),
    approve: slot({
      attrs: () => ({
        "data-slot": "attestation-status-approve",
        type: "button",
        "data-agent-confirm": personOnly("Attestation approve needs a person"),
      }),
      on: {
        click: (_event, { api }) => {
          api.approve();
        },
      },
    }),
    reject: slot({
      attrs: () => ({
        "data-slot": "attestation-status-reject",
        type: "button",
        "data-agent-confirm": personOnly("Attestation reject needs a person"),
      }),
      on: {
        click: (_event, { api }) => {
          api.reject();
        },
      },
    }),
    escalate: slot({
      attrs: () => ({
        "data-slot": "attestation-status-escalate",
        type: "button",
        "data-agent-confirm": personOnly("Attestation escalate needs a person"),
      }),
      on: {
        click: (_event, { api }) => {
          api.escalate();
        },
      },
    }),
  }),
  agent: {
    // approve / reject / escalate stay as confirm-gated button presses
    actions: ["setStatus"],
    closed: true,
    items: (api) => api.allItems(),
  },
});
