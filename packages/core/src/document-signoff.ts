/**
 * Signing off a document, level by level: performed, reviewed, approved.
 *
 * A signature belongs to the version that was signed. A later save does not
 * take it away: it marks it "changed after sign-off", and it stays until a
 * person withdraws it (with a reason) or signs again. Open points never block
 * a signature unless the company sets `blockOpenPoints`; then only an empty
 * list lets a signature through, and the points stay with the record either
 * way, so it shows what the signer knew. Technical facts always stop a
 * signature: unsaved or conflicting work, or a document with nothing in it.
 * Withdrawing a signature is never blocked. Who may sign is the caller's (roles,
 * `@booki/core/server`); the four-eyes rule is checked here, because it is
 * about the document's own history.
 */
import { BookiError, type MessageCode } from "./msg.js";

export type SignoffLevel = "performed" | "reviewed" | "approved";

/** The order levels come in: a review needs a performance, an approval a review. */
export const SIGNOFF_LEVELS: readonly SignoffLevel[] = ["performed", "reviewed", "approved"];

export type DocumentSignature = {
  level: SignoffLevel;
  by: string;
  byName?: string;
  at: string;
  /** The document version that was signed. */
  version: number;
  /** Open points the signer signed with. */
  openPoints: string[];
  withdrawn?: { by: string; at: string; reason: string };
};

export type SaveState = "saved" | "pending" | "conflict" | "unsaved";

export type SignableDocument = {
  id: string;
  version: number;
  saveState: SaveState;
  /** False when the document has no content to sign. Default true. */
  hasContent?: boolean;
  openPoints: string[];
  /** Every signature, withdrawn ones kept as history. */
  signatures: DocumentSignature[];
  /**
   * Levels whose evidence changed after signing, as your server found by
   * comparing the signed basis's fingerprint. Never computed here.
   */
  basisChanged?: SignoffLevel[];
};

/** Company rules for signing. Every rule is off by default. */
export type SignoffRules = {
  /** Refuse a signature while the document has open points. Default false: they go with the signature. */
  blockOpenPoints?: boolean;
};

export type SignoffMark = "unsigned" | "signed" | "changed-after" | "basis-changed";

export type LevelState = {
  level: SignoffLevel;
  signature: DocumentSignature | null;
  mark: SignoffMark;
};

/** The signature in force for a level: the latest one not withdrawn. */
export function activeSignature(document: SignableDocument, level: SignoffLevel): DocumentSignature | null {
  const active = document.signatures.filter((signature) => signature.level === level && !signature.withdrawn);
  return active.at(-1) ?? null;
}

/** Each level with its signature and its mark. Marks are derived, never stored. */
export function signoffStates(document: SignableDocument): LevelState[] {
  return SIGNOFF_LEVELS.map((level) => {
    const signature = activeSignature(document, level);
    let mark: SignoffMark = "unsigned";
    if (signature) {
      mark = document.basisChanged?.includes(level)
        ? "basis-changed"
        : document.version > signature.version
          ? "changed-after"
          : "signed";
    }
    return { level, signature, mark };
  });
}

/** What stops a signature right now, as message codes. Empty when it can be signed. */
export function signObstacles(document: SignableDocument, rules: SignoffRules = {}): MessageCode[] {
  const obstacles: MessageCode[] = [];
  if (document.saveState === "unsaved") obstacles.push("signoff.unsaved");
  if (document.saveState === "pending") obstacles.push("signoff.saving");
  if (document.saveState === "conflict") obstacles.push("signoff.conflict");
  if (document.hasContent === false) obstacles.push("signoff.empty");
  if (rules.blockOpenPoints && document.openPoints.length > 0) obstacles.push("signoff.open-points");
  return obstacles;
}

/**
 * Sign a level. Refused for a technical obstacle, a missing earlier level, a
 * level already signed on this version, or (for review and approval) the
 * person who performed the work. The open points go with the signature,
 * unless `rules.blockOpenPoints` refuses it while any are open.
 */
export function signDocument(
  document: SignableDocument,
  level: SignoffLevel,
  signer: { id: string; name?: string },
  at: string,
  rules: SignoffRules = {},
): SignableDocument {
  const [obstacle] = signObstacles(document, rules);
  if (obstacle) throw new BookiError(obstacle, { id: document.id, count: document.openPoints.length });
  const index = SIGNOFF_LEVELS.indexOf(level);
  if (index < 0)
    throw new BookiError("signoff.unknown-level", { level: String(level), levels: SIGNOFF_LEVELS.join(", ") });
  const before = SIGNOFF_LEVELS[index - 1];
  if (before && !activeSignature(document, before)) {
    throw new BookiError("signoff.needs-earlier", { level, earlier: before });
  }
  const current = activeSignature(document, level);
  if (current && current.version === document.version && !document.basisChanged?.includes(level)) {
    throw new BookiError("signoff.already-signed", { level, version: document.version });
  }
  if (level !== "performed" && activeSignature(document, "performed")?.by === signer.id) {
    throw new BookiError("signoff.four-eyes", { level });
  }
  const signature: DocumentSignature = {
    level,
    by: signer.id,
    ...(signer.name ? { byName: signer.name } : {}),
    at,
    version: document.version,
    openPoints: [...document.openPoints],
  };
  // Signing again replaces the one in force; the old one stays as history.
  const signatures = document.signatures.map((item) =>
    item === current ? { ...item, withdrawn: { by: signer.id, at, reason: "signed again" } } : item,
  );
  return {
    ...document,
    signatures: [...signatures, signature],
    basisChanged: document.basisChanged?.filter((item) => item !== level),
  };
}

/**
 * Withdraw the signature in force for a level, with a reason a person wrote
 * (default at least 20 characters). Later levels resting on it are withdrawn
 * with it: a review of work no longer signed as performed means nothing.
 */
export function withdrawSignature(
  document: SignableDocument,
  level: SignoffLevel,
  by: string,
  at: string,
  reason: string,
  options: { minReason?: number } = {},
): SignableDocument {
  const min = options.minReason ?? 20;
  if (reason.trim().length < min) throw new BookiError("signoff.reason-required", { min });
  if (!activeSignature(document, level)) throw new BookiError("signoff.not-signed", { level });
  const from = SIGNOFF_LEVELS.indexOf(level);
  const affected = new Set(SIGNOFF_LEVELS.slice(from));
  const signatures = document.signatures.map((signature) =>
    affected.has(signature.level) && !signature.withdrawn
      ? { ...signature, withdrawn: { by, at, reason: reason.trim() } }
      : signature,
  );
  return { ...document, signatures };
}
