import type { SignableDocument, SignoffLevel, SignoffMark } from "@booki/core/document-signoff";
import type { BookiChangeDetails } from "./change-details.js";
import { createParts } from "@ui-sdk/react/primitive";
import type { ReactNode } from "react";
import { useAccessFor } from "./access.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import { buttonKey, documentSignoff, type LevelView } from "@booki/primitives/document-signoff";

const parts = createParts(documentSignoff, {
  root: "div",
  sign: "button",
  reason: "textarea",
  withdraw: "button",
});
const DocumentSignoffRoot = parts.Root;
const DocumentSignoffSign = parts.Sign;
const DocumentSignoffReason = parts.Reason;
const DocumentSignoffWithdraw = parts.Withdraw;

const COPY = {
  EN: {
    label: "Sign-off",
    level: { performed: "Performed", reviewed: "Reviewed", approved: "Approved" } satisfies Record<
      SignoffLevel,
      string
    >,
    sign: { performed: "Sign as performed", reviewed: "Sign as reviewed", approved: "Approve" } satisfies Record<
      SignoffLevel,
      string
    >,
    signedBy: "Signed by",
    version: "version",
    waitsFor: "Waits for",
    mark: {
      unsigned: "Not signed",
      signed: "Signed",
      "changed-after": "Changed after sign-off",
      "basis-changed": "The evidence changed after sign-off",
    } satisfies Record<SignoffMark, string>,
    openPoints: (n: number) =>
      n === 1 ? "1 open point goes with the signature" : `${n} open points go with the signature`,
    signedWith: (n: number) => (n === 1 ? "signed with 1 open point" : `signed with ${n} open points`),
    withdraw: "Withdraw",
    reason: "Reason for withdrawing",
    reasonHint: (min: number) => `At least ${min} characters. Later levels are withdrawn with it.`,
  },
  NO: {
    label: "Signering",
    level: { performed: "Utført", reviewed: "Gjennomgått", approved: "Godkjent" } satisfies Record<
      SignoffLevel,
      string
    >,
    sign: { performed: "Signer utført", reviewed: "Signer gjennomgått", approved: "Godkjenn" } satisfies Record<
      SignoffLevel,
      string
    >,
    signedBy: "Signert av",
    version: "versjon",
    waitsFor: "Venter på",
    mark: {
      unsigned: "Ikke signert",
      signed: "Signert",
      "changed-after": "Endret etter signering",
      "basis-changed": "Grunnlaget er endret etter signering",
    } satisfies Record<SignoffMark, string>,
    openPoints: (n: number) => (n === 1 ? "1 åpent punkt følger signaturen" : `${n} åpne punkter følger signaturen`),
    signedWith: (n: number) => (n === 1 ? "signert med 1 åpent punkt" : `signert med ${n} åpne punkter`),
    withdraw: "Trekk signaturen",
    reason: "Begrunnelse for å trekke signaturen",
    reasonHint: (min: number) => `Minst ${min} tegn. Senere nivåer trekkes med.`,
  },
} as const;

/** The permission each level takes, so `BookiAccessProvider` can refuse a person's button. */
const PERMISSION = { performed: "audit.prepare", reviewed: "audit.review", approved: "audit.sign-off" } as const;

export type DocumentSignoffProps = {
  document?: SignableDocument;
  defaultDocument?: SignableDocument;
  onDocumentChange?: (document: SignableDocument, details: BookiChangeDetails) => void;
  /** The levels this document uses, in order. Default all three. */
  levels?: SignoffLevel[];
  actor?: string;
  actorName?: string;
  minReason?: number;
  nameOf?: (id: string) => ReactNode;
  /** A signing time as the person reads it. */
  formatTime?: (iso: string) => string;
  className?: string;
  "aria-label"?: string;
};

type RootState = {
  document: SignableDocument;
  levels: LevelView[];
  obstacles: string[];
  drafts: Record<string, string>;
  refusal: string;
};

/**
 * The sign-off line that ends a working paper: each level, who signed which
 * version, what changed since, and a person's buttons. A role that may not
 * sign sees why, never a disabled button.
 */
function DocumentSignoff({
  document,
  defaultDocument,
  onDocumentChange,
  levels: used = ["performed", "reviewed", "approved"],
  actor,
  actorName,
  minReason = 20,
  nameOf = (id) => id,
  formatTime = (iso) => iso.slice(0, 10),
  className,
  "aria-label": ariaLabel,
}: DocumentSignoffProps) {
  const { country } = useBookiLocaleOptional();
  const say = useSay();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const access = useAccessFor(
    Object.fromEntries(
      used.flatMap((level) => [
        [`sign-${level}`, PERMISSION[level]],
        [`withdraw-${level}`, PERMISSION[level]],
      ]),
    ),
    actor,
  );
  return (
    <DocumentSignoffRoot
      document={document}
      defaultDocument={defaultDocument}
      onDocumentChange={onDocumentChange}
      actor={access.actor}
      actorName={actorName}
      denied={access.denied}
      minReason={minReason}
      className={className}
      aria-label={ariaLabel ?? copy.label}
    >
      {(state: RootState) => {
        const open = state.document.openPoints.length;
        return (
          <>
            {state.obstacles.length ? (
              <ul data-slot="document-signoff-obstacles" role="status">
                {state.obstacles.map((obstacle) => (
                  <li key={obstacle}>{say(obstacle)}</li>
                ))}
              </ul>
            ) : null}
            <ol data-slot="document-signoff-levels">
              {state.levels
                .filter((view) => used.includes(view.level))
                .map((view, index, shown) => {
                  const before = shown[index - 1];
                  const waiting = before && before.mark === "unsigned";
                  const denied = access.denied?.[`sign-${view.level}`];
                  const signedNow = view.mark === "signed";
                  const hintId = `${state.document.id}-${view.level}-withdraw-hint`;
                  return (
                    <li key={view.level} data-level={view.level} data-mark={view.mark}>
                      <span data-slot="document-signoff-level">{copy.level[view.level]}</span>
                      <span data-slot="document-signoff-mark" data-mark={view.mark}>
                        {copy.mark[view.mark]}
                      </span>
                      {view.by ? (
                        <span data-slot="document-signoff-by">
                          {copy.signedBy} {nameOf(view.by)} · {formatTime(view.at ?? "")} · {copy.version}{" "}
                          {view.version}
                          {view.openPoints?.length ? ` · ${copy.signedWith(view.openPoints.length)}` : null}
                        </span>
                      ) : null}
                      <span data-slot="document-signoff-actions">
                        {waiting ? (
                          <span data-slot="document-signoff-wait">
                            {copy.waitsFor} {copy.level[before!.level].toLowerCase()}
                          </span>
                        ) : !signedNow && !state.obstacles.length ? (
                          denied ? (
                            <span data-slot="document-signoff-wait">{say(denied)}</span>
                          ) : (
                            <DocumentSignoffSign value={buttonKey(view.level, "sign")}>
                              {copy.sign[view.level]}
                            </DocumentSignoffSign>
                          )
                        ) : null}
                        {view.by && !access.denied?.[`withdraw-${view.level}`] ? (
                          <span data-slot="document-signoff-withdraw">
                            <DocumentSignoffReason
                              value={view.level}
                              rows={2}
                              aria-label={`${copy.reason}: ${copy.level[view.level]}`}
                              aria-describedby={hintId}
                            />
                            <small id={hintId} data-slot="document-signoff-hint">
                              {copy.reasonHint(minReason)}
                            </small>
                            <DocumentSignoffWithdraw
                              value={buttonKey(view.level, "withdraw")}
                              aria-label={`${copy.withdraw}: ${copy.level[view.level]}`}
                            >
                              {copy.withdraw}
                            </DocumentSignoffWithdraw>
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
            </ol>
            {open ? <p data-slot="document-signoff-open">{copy.openPoints(open)}</p> : null}
            {state.refusal ? (
              <p data-slot="document-signoff-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </DocumentSignoffRoot>
  );
}

export {
  DocumentSignoff,
  DocumentSignoffReason,
  DocumentSignoffRoot,
  DocumentSignoffSign,
  DocumentSignoffWithdraw,
  documentSignoff,
};
export type { SignableDocument, SignoffLevel, SignoffMark };
