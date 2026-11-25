import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog";
import { Input } from "@ui-sdk/react/input";
import { useState, type ReactNode } from "react";
import { useBookiLocaleOptional } from "./locale.js";
import { personOnly } from "@booki-aui/primitives/person-only";

export type ApprovalGateProps = {
  title?: string;
  description?: string;
  summary?: ReactNode;
  confirmWord?: string;
  triggerLabel?: string;
  onApprove?: () => void | Promise<void>;
  onReject?: () => void;
  className?: string;
};

/**
 * Segregation of duties: agent proposes, person approves via typed confirm.
 */
function ApprovalGate({
  title,
  description,
  summary,
  confirmWord = "APPROVE",
  triggerLabel,
  onApprove,
  onReject,
  className,
}: ApprovalGateProps) {
  const { profile } = useBookiLocaleOptional();
  const [typed, setTyped] = useState("");
  const canApprove = typed.trim().toUpperCase() === confirmWord.toUpperCase();

  return (
    <div data-slot="approval-gate" className={className}>
      <Dialog>
        <DialogTrigger data-slot="approval-gate-trigger">{triggerLabel ?? profile.copy.approve}</DialogTrigger>
        <DialogContent data-slot="approval-gate-dialog">
          <DialogTitle>{title ?? profile.copy.approve}</DialogTitle>
          <DialogDescription>{description ?? profile.copy.proposedByAgent}</DialogDescription>
          {summary ? <div data-slot="approval-gate-summary">{summary}</div> : null}
          {/* The typed word is the person's confirmation: an agent may not type it either. */}
          <label data-slot="approval-gate-type" data-agent-confirm={personOnly("Attestation needs a person")}>
            <span>{profile.copy.typeToConfirm.replace("APPROVE", confirmWord)}</span>
            {/*
              The gate is a dialog the person just opened to type this word. It is the first field, so the
              dialog focuses it when opened with a mouse or keys, and leaves it alone when opened by touch:
              on a phone the keyboard would cover what is being approved before it is read.
            */}
            <Input
              value={typed}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              onValueChange={(v: string) => setTyped(v)}
            />
          </label>
          <div data-slot="approval-gate-actions">
            <DialogClose
              onClick={() => {
                setTyped("");
                onReject?.();
              }}
            >
              {profile.copy.cancel}
            </DialogClose>
            <DialogClose
              disabled={!canApprove}
              data-agent-confirm={personOnly("Attestation needs a person")}
              action={async () => {
                await onApprove?.();
                setTyped("");
              }}
            >
              {profile.copy.approve}
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { ApprovalGate };
