import { createParts } from "@ui-sdk/react/primitive";
import { useState } from "react";
import { useBookiLocaleOptional } from "./locale.js";
import { type AttestationStatusValue, statusLabelFor, attestationStatus } from "@booki/primitives/attestation-status";

const parts = createParts(attestationStatus, {
  root: "div",
  badge: "span",
  approve: "button",
  reject: "button",
  escalate: "button",
});

const AttestationStatusRoot = parts.Root;
const AttestationStatusBadge = parts.Badge;
const AttestationStatusApprove = parts.Approve;
const AttestationStatusReject = parts.Reject;
const AttestationStatusEscalate = parts.Escalate;

export type AttestationStatusProps = {
  value?: AttestationStatusValue;
  defaultValue?: AttestationStatusValue;
  onValueChange?: (value: AttestationStatusValue) => void;
  onApprove?: () => void;
  onReject?: () => void;
  onEscalate?: () => void;
  showActions?: boolean;
  className?: string;
};

function AttestationStatus({
  value,
  defaultValue = "pending",
  onValueChange,
  onApprove,
  onReject,
  onEscalate,
  showActions = true,
  className,
}: AttestationStatusProps) {
  const { profile } = useBookiLocaleOptional();
  const [internal, setInternal] = useState<AttestationStatusValue>(value ?? defaultValue);
  const current = value ?? internal;
  const labels = {
    pendingLabel: profile.copy.attestationPending,
    approvedLabel: profile.copy.attestationApproved,
    rejectedLabel: profile.copy.attestationRejected,
    escalatedLabel: profile.copy.attestationEscalated,
  };

  return (
    <AttestationStatusRoot
      value={value}
      defaultValue={defaultValue}
      label={profile.copy.attestation}
      pendingLabel={labels.pendingLabel}
      approvedLabel={labels.approvedLabel}
      rejectedLabel={labels.rejectedLabel}
      escalatedLabel={labels.escalatedLabel}
      onValueChange={(next) => {
        setInternal(next);
        onValueChange?.(next);
      }}
      onApprove={onApprove}
      onReject={onReject}
      onEscalate={onEscalate}
      className={className}
      aria-label={profile.copy.attestation}
    >
      <AttestationStatusBadge>{statusLabelFor(current, labels)}</AttestationStatusBadge>
      {showActions ? (
        <div data-slot="attestation-status-actions">
          <AttestationStatusApprove>{profile.copy.approve}</AttestationStatusApprove>
          <AttestationStatusReject>{profile.copy.reject}</AttestationStatusReject>
          <AttestationStatusEscalate>{profile.copy.escalate}</AttestationStatusEscalate>
        </div>
      ) : null}
    </AttestationStatusRoot>
  );
}

export {
  AttestationStatus,
  AttestationStatusRoot,
  AttestationStatusBadge,
  AttestationStatusApprove,
  AttestationStatusReject,
  AttestationStatusEscalate,
  attestationStatus,
};

export { type AttestationStatusValue } from "@booki/primitives/attestation-status";
