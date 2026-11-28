import { numberFormat } from "@booki-aui/core/intl";
import {
  ATTACHMENT_KINDS,
  type Attachment,
  type AttachmentFile,
  type AttachmentKind,
  type AttachmentRegion,
} from "@booki-aui/core/attachments";
import type { BookiChangeDetails } from "./change-details.js";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import { useAccessFor } from "./access.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import { evidenceList } from "@booki-aui/primitives/evidence-list";

const TAGS = {
  root: "div",
  link: "button",
  kind: "select",
  remove: "button",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof evidenceList, typeof TAGS> = createParts(evidenceList, TAGS);
const EvidenceListRoot: (typeof parts)["Root"] = parts.Root;
const EvidenceListLink: (typeof parts)["Link"] = parts.Link;
const EvidenceListKind: (typeof parts)["Kind"] = parts.Kind;
const EvidenceListRemove: (typeof parts)["Remove"] = parts.Remove;

const COPY = {
  EN: {
    label: "Evidence",
    evidenced: "Evidenced",
    missing: "Missing",
    none: "Nothing is linked yet.",
    locked: "Locked",
    kind: "Kind",
    remove: "Remove",
    link: "Link",
    pool: "Files that can be linked",
    page: "page",
    addedBy: "added by",
    kinds: {
      invoice: "Invoice",
      receipt: "Receipt",
      contract: "Contract",
      "bank-statement": "Bank statement",
      other: "Other",
    },
  },
  NO: {
    label: "Bilag",
    evidenced: "Dokumentert",
    missing: "Mangler",
    none: "Ingenting er lagt ved ennå.",
    locked: "Låst",
    kind: "Type",
    remove: "Fjern",
    link: "Legg ved",
    pool: "Filer som kan legges ved",
    page: "side",
    addedBy: "lagt til av",
    kinds: {
      invoice: "Faktura",
      receipt: "Kvittering",
      contract: "Kontrakt",
      "bank-statement": "Kontoutskrift",
      other: "Annet",
    },
  },
} as const;

export type EvidenceListProps = {
  attachments?: Attachment[];
  defaultAttachments?: Attachment[];
  pool?: AttachmentFile[];
  requires?: AttachmentKind[];
  locked?: boolean;
  actor?: string;
  agentActor?: string;
  onAttachmentsChange?: (attachments: Attachment[], details: BookiChangeDetails) => void;
  className?: string;
  "aria-label"?: string;
};

type RootState = {
  attachments: Attachment[];
  available: AttachmentFile[];
  missing: AttachmentKind[];
  evidenced: boolean;
  locked: boolean;
  refusal: string;
};

function size(bytes: number, locale: string): string {
  const units = ["B", "kB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${numberFormat(locale, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(value)} ${units[unit]}`;
}

/** Composed list: what is linked, what is missing, and the files that can be linked. */
function EvidenceList({
  attachments,
  defaultAttachments,
  pool,
  requires,
  locked,
  actor,
  agentActor,
  onAttachmentsChange,
  className,
  "aria-label": ariaLabel,
}: EvidenceListProps) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const access = useAccessFor({ remove: "evidence.remove" }, actor);
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const meta = (file: AttachmentFile | Attachment) => (
    <span data-slot="evidence-list-meta">
      {file.mediaType} · {size(file.sizeBytes, profile.locale)} ·{" "}
      <span title={file.sha256}>sha256 {file.sha256.slice(0, 12)}</span>
      {file.region?.page ? ` · ${copy.page} ${file.region.page}` : ""}
    </span>
  );
  return (
    <EvidenceListRoot
      attachments={attachments}
      defaultAttachments={defaultAttachments}
      pool={pool}
      requires={requires}
      locked={locked}
      actor={access.actor}
      denied={access.denied}
      agentActor={agentActor}
      onAttachmentsChange={onAttachmentsChange}
      className={className}
      aria-label={ariaLabel ?? copy.label}
    >
      {(state: RootState) => (
        <>
          <p data-slot="evidence-list-status" role="status">
            {state.evidenced
              ? copy.evidenced
              : `${copy.missing}: ${state.missing.map((kind) => copy.kinds[kind]).join(", ")}`}
            {state.locked ? ` · ${copy.locked}` : ""}
          </p>
          {state.attachments.length === 0 ? (
            <p data-slot="evidence-list-empty">{copy.none}</p>
          ) : (
            <ul data-slot="evidence-list-items">
              {state.attachments.map((item) => (
                <li key={item.id} data-kind={item.kind}>
                  <span data-slot="evidence-list-name">{item.fileName}</span>
                  {meta(item)}
                  <span data-slot="evidence-list-added">
                    {copy.addedBy} {item.addedBy}, <time dateTime={item.addedAt}>{item.addedAt.slice(0, 10)}</time>
                  </span>
                  {/* A locked entry shows the kind as text: a disabled list would switch the whole control off for an agent. */}
                  {state.locked ? (
                    <span data-slot="evidence-list-kind-text">{copy.kinds[item.kind]}</span>
                  ) : (
                    <>
                      <EvidenceListKind value={item.id} aria-label={`${copy.kind}: ${item.fileName}`}>
                        {ATTACHMENT_KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {copy.kinds[kind]}
                          </option>
                        ))}
                      </EvidenceListKind>
                      <EvidenceListRemove value={item.id} aria-label={`${copy.remove}: ${item.fileName}`}>
                        {copy.remove}
                      </EvidenceListRemove>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          {state.available.length > 0 ? (
            <ul data-slot="evidence-list-pool" aria-label={copy.pool}>
              {state.available.map((file) => (
                <li key={file.id}>
                  <span data-slot="evidence-list-name">{file.fileName}</span>
                  {meta(file)}
                  <EvidenceListLink value={file.id} aria-label={`${copy.link}: ${file.fileName}`}>
                    {copy.link}
                  </EvidenceListLink>
                </li>
              ))}
            </ul>
          ) : null}
          {state.refusal ? (
            <p data-slot="evidence-list-error" role="alert">
              {say(state.refusal)}
            </p>
          ) : null}
        </>
      )}
    </EvidenceListRoot>
  );
}

export { EvidenceList, EvidenceListKind, EvidenceListLink, EvidenceListRemove, EvidenceListRoot, evidenceList };
export type { Attachment, AttachmentFile, AttachmentKind, AttachmentRegion };
