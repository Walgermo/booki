import { BookiError, msg } from "./msg.js";

/** What a piece of evidence is. */
export const ATTACHMENT_KINDS = ["invoice", "receipt", "contract", "bank-statement", "other"] as const;

export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/** Where in the file the evidence is. */
export type AttachmentRegion = {
  /** Page number, starting at 1. */
  page?: number;
  /** A box on the page as [x, y, width, height] in thousandths of the page (0 to 1000). */
  box?: [number, number, number, number];
};

/**
 * A file the host knows about. This module never reads or uploads file bytes:
 * the host supplies the metadata, including the SHA-256 hash.
 */
export type AttachmentFile = {
  id: string;
  fileName: string;
  /** IANA media type, e.g. "application/pdf". */
  mediaType: string;
  /** Size in whole bytes. */
  sizeBytes: number;
  /** SHA-256 of the file as 64 hex characters. */
  sha256: string;
  /** What the host thinks it is. Used when linking without a kind. */
  kind?: AttachmentKind;
  region?: AttachmentRegion;
};

/** A file linked to an entry (voucher, invoice, claim) as evidence. */
export type Attachment = Omit<AttachmentFile, "kind"> & {
  kind: AttachmentKind;
  /** Who linked it. */
  addedBy: string;
  /** ISO timestamp. */
  addedAt: string;
};

const KIND_LIST = ATTACHMENT_KINDS.join(", ");

/** Throws unless `kind` is one of the attachment kinds. */
export function checkAttachmentKind(kind: unknown): AttachmentKind {
  if (!(ATTACHMENT_KINDS as readonly string[]).includes(String(kind))) {
    throw new BookiError("attachment.unknown-kind", { kind: String(kind), kinds: KIND_LIST });
  }
  return kind as AttachmentKind;
}

const hashOf = (file: { sha256: string }) =>
  String(file.sha256 ?? "")
    .trim()
    .toLowerCase();

/** Throws unless the file's metadata is complete and well formed. */
export function validateAttachmentFile<T extends AttachmentFile>(file: T): T {
  const id = String(file?.id ?? "").trim();
  if (id === "") throw new BookiError("attachment.id-required");
  if (String(file.fileName ?? "").trim() === "") throw new BookiError("attachment.file-name-required", { id });
  if (!/^[\w.+-]+\/[\w.+-]+$/.test(String(file.mediaType ?? ""))) {
    throw new BookiError("attachment.media-type", { id, value: String(file.mediaType) });
  }
  if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0) {
    throw new BookiError("attachment.size", { id, value: String(file.sizeBytes) });
  }
  if (!/^[0-9a-f]{64}$/.test(hashOf(file))) {
    throw new BookiError("attachment.sha256", { id, value: String(file.sha256) });
  }
  if (file.kind !== undefined) checkAttachmentKind(file.kind);
  const page = file.region?.page;
  if (page !== undefined && (!Number.isSafeInteger(page) || page < 1)) {
    throw new BookiError("attachment.page", { id, value: String(page) });
  }
  const box = file.region?.box;
  if (box !== undefined && (box.length !== 4 || box.some((n) => !Number.isSafeInteger(n) || n < 0 || n > 1000))) {
    throw new BookiError("attachment.box", { id });
  }
  return file;
}

/** Groups of attachments on the entry that are the same file (same hash). */
export function duplicateAttachments(attachments: Attachment[]): Attachment[][] {
  const groups = new Map<string, Attachment[]>();
  for (const attachment of attachments) {
    groups.set(hashOf(attachment), [...(groups.get(hashOf(attachment)) ?? []), attachment]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

/**
 * Link a file to the entry. Refused when the id is already linked or a linked
 * attachment has the same hash (the same file twice). Allowed on a locked
 * entry: evidence can be added, never taken away.
 */
export function linkAttachment(
  attachments: Attachment[],
  file: AttachmentFile,
  kind: AttachmentKind | undefined,
  addedBy: string,
  addedAt: string,
): Attachment[] {
  validateAttachmentFile(file);
  const by = String(addedBy ?? "").trim();
  if (by === "") throw new BookiError("attachment.linker-required", { id: String(file.id) });
  if (attachments.some((item) => item.id === file.id)) {
    throw new BookiError("attachment.already-linked", { id: String(file.id) });
  }
  const same = attachments.find((item) => hashOf(item) === hashOf(file));
  if (same) {
    throw new BookiError("attachment.same-file", {
      id: String(file.id),
      fileName: String(file.fileName),
      otherId: String(same.id),
      otherFileName: String(same.fileName),
    });
  }
  const { kind: suggested, ...rest } = file;
  return [
    ...attachments,
    { ...rest, sha256: hashOf(file), kind: checkAttachmentKind(kind ?? suggested ?? "other"), addedBy: by, addedAt },
  ];
}

function find(attachments: Attachment[], id: string): Attachment {
  const found = attachments.find((item) => item.id === String(id));
  if (!found) {
    throw new BookiError("attachment.not-found", {
      id: String(id),
      linked: attachments.map((item) => item.id).join(", ") || msg("word.none"),
    });
  }
  return found;
}

/** Change what a linked attachment is. Refused on a locked entry. */
export function setAttachmentKind(
  attachments: Attachment[],
  id: string,
  kind: AttachmentKind,
  locked = false,
): Attachment[] {
  const current = find(attachments, id);
  const next = checkAttachmentKind(kind);
  if (locked) {
    throw new BookiError("attachment.locked-kind", { id: String(current.id) });
  }
  return attachments.map((item) => (item.id === current.id ? { ...item, kind: next } : item));
}

/** Unlink an attachment. Refused on a locked entry. */
export function removeAttachment(attachments: Attachment[], id: string, locked = false): Attachment[] {
  const current = find(attachments, id);
  if (locked) {
    throw new BookiError("attachment.locked-remove", { id: String(current.id), fileName: String(current.fileName) });
  }
  return attachments.filter((item) => item.id !== current.id);
}

/** Required kinds that no linked attachment has. */
export function missingKinds(attachments: Attachment[], requires: readonly AttachmentKind[] = []): AttachmentKind[] {
  const present = new Set(attachments.map((item) => item.kind));
  return [...new Set(requires)].filter((kind) => !present.has(kind));
}

/** True when every required kind is present. */
export function isEvidenced(attachments: Attachment[], requires: readonly AttachmentKind[] = []): boolean {
  return missingKinds(attachments, requires).length === 0;
}

/** Throws naming the kinds of evidence that are still missing. */
export function assertEvidenced(attachments: Attachment[], requires: readonly AttachmentKind[] = []): void {
  const missing = missingKinds(attachments, requires);
  if (missing.length > 0) {
    throw new BookiError("attachment.not-evidenced", { missing: missing.join(", ") });
  }
}
