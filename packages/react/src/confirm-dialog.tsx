import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@ui-sdk/react/alert-dialog";
import { useId, useState, type ReactNode } from "react";
import { personOnly as markPersonOnly } from "@booki-aui/primitives/person-only";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";

const COPY = {
  EN: {
    confirm: "Confirm",
    cancel: "Cancel",
    pending: "Working…",
    retry: "Try again",
    pendingAnnouncement: "Still working",
    typeWord: (word: string) => `Type ${word} to confirm`,
    personOnly: "This decision needs a person",
  },
  NO: {
    confirm: "Bekreft",
    cancel: "Avbryt",
    pending: "Arbeider …",
    retry: "Prøv igjen",
    pendingAnnouncement: "Arbeider fortsatt",
    typeWord: (word: string) => `Skriv ${word} for å bekrefte`,
    personOnly: "Denne beslutningen krever en person",
  },
} as const;

export type ConfirmDialogProps = {
  /** The question, like "Post voucher 1042?". */
  title: ReactNode;
  /** What agreeing does, and whether it can be undone. */
  description?: ReactNode;
  /** What is being decided: amounts, accounts, the voucher. Shown between the question and the answer. */
  children?: ReactNode;
  /** The button that opens it. Leave out to open it with `open` / `defaultOpen`. */
  trigger?: ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * Runs when the person agrees. A returned Promise keeps the dialog open,
   * marks the button pending and shows a rejection's message in the dialog.
   */
  onConfirm: () => unknown;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  /** "danger" for what cannot be undone: deleting, releasing a payment. */
  tone?: "default" | "danger";
  /** A word the person types before the button works, like the voucher number. */
  confirmWord?: string;
  /**
   * The sentence an agent's bridge hears when it tries the decision. Every
   * confirm dialog is a person's decision: the answer (and the typed word)
   * sit inside `data-agent-confirm`, so an agent can read the question and
   * cancel, never agree.
   */
  personOnly?: string;
  className?: string;
};

/**
 * A question a person answers before something happens: post, pay, release,
 * delete. Cancel is free for anyone; agreeing is a person's, whatever an
 * agent's role. The answer can run async work and stays open until it is done.
 */
function ConfirmDialog({
  title,
  description,
  children,
  trigger,
  open,
  defaultOpen,
  onOpenChange,
  onConfirm,
  confirmLabel,
  cancelLabel,
  tone = "default",
  confirmWord,
  personOnly,
  className,
}: ConfirmDialogProps) {
  const { country } = useBookiLocaleOptional();
  const say = useSay();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const [typed, setTyped] = useState("");
  const wordId = useId();
  // A controlled dialog closed by its owner starts empty next time too:
  // adjust the state while rendering, not in an effect after it.
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open === false) setTyped("");
  }
  const ready = !confirmWord || typed.trim() === confirmWord;
  return (
    <AlertDialog
      open={open}
      defaultOpen={defaultOpen}
      pendingAnnouncement={copy.pendingAnnouncement}
      onOpenChange={(next) => {
        if (!next) setTyped("");
        onOpenChange?.(next);
      }}
    >
      {trigger ? (
        <AlertDialogTrigger data-variant={tone === "danger" ? "danger" : undefined}>{trigger}</AlertDialogTrigger>
      ) : null}
      <AlertDialogBackdrop data-booki-dialog="backdrop" />
      <AlertDialogContent data-booki="" data-booki-dialog="content" data-tone={tone} className={className}>
        <AlertDialogTitle data-booki-dialog="title">{title}</AlertDialogTitle>
        {description ? (
          <AlertDialogDescription data-booki-dialog="description">{description}</AlertDialogDescription>
        ) : null}
        {children ? <div data-booki-dialog="summary">{children}</div> : null}
        <div data-booki-dialog="answers">
          <AlertDialogClose data-variant="secondary">{cancelLabel ?? copy.cancel}</AlertDialogClose>
          {/* The decision: an agent may read it, never give it. */}
          <div data-booki-dialog="decision" data-agent-confirm={markPersonOnly(personOnly ?? copy.personOnly)}>
            {confirmWord ? (
              <label data-booki-dialog="word" htmlFor={wordId}>
                <span>{copy.typeWord(confirmWord)}</span>
                <input
                  id={wordId}
                  value={typed}
                  autoComplete="off"
                  onChange={(event) => setTyped(event.target.value)}
                />
              </label>
            ) : null}
            <AlertDialogClose
              value="confirm"
              data-variant={tone === "danger" ? "danger" : undefined}
              disabled={!ready}
              action={() => onConfirm()}
              render={(props, state) => (
                <span data-booki-dialog="confirm">
                  {state.error ? (
                    <span data-booki-dialog="error" role="alert">
                      {state.error instanceof Error ? say(state.error.message) : String(state.error)}
                    </span>
                  ) : null}
                  <button {...props}>
                    {state.pending ? copy.pending : state.error ? copy.retry : (confirmLabel ?? copy.confirm)}
                  </button>
                </span>
              )}
            />
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { ConfirmDialog };
