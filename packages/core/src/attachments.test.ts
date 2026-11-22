import { describe, expect, it } from "vitest";
import {
  assertEvidenced,
  checkAttachmentKind,
  duplicateAttachments,
  isEvidenced,
  linkAttachment,
  missingKinds,
  removeAttachment,
  setAttachmentKind,
  validateAttachmentFile,
  type Attachment,
  type AttachmentFile,
} from "./attachments.js";

const AT = "2026-02-01T09:00:00Z";
const hash = (c: string) => c.repeat(64);
const file = (id: string, c: string, over: Partial<AttachmentFile> = {}): AttachmentFile => ({
  id,
  fileName: `${id}.pdf`,
  mediaType: "application/pdf",
  sizeBytes: 1024,
  sha256: hash(c),
  ...over,
});

describe("attachments", () => {
  it("links a file with its kind, who and when", () => {
    const linked = linkAttachment([], file("f1", "a", { kind: "receipt", region: { page: 2 } }), undefined, "kari", AT);
    expect(linked).toEqual([
      {
        id: "f1",
        fileName: "f1.pdf",
        mediaType: "application/pdf",
        sizeBytes: 1024,
        sha256: hash("a"),
        kind: "receipt",
        region: { page: 2 },
        addedBy: "kari",
        addedAt: AT,
      },
    ]);
    expect(linkAttachment([], file("f1", "a", { kind: "receipt" }), "invoice", "kari", AT)[0]?.kind).toBe("invoice");
    expect(linkAttachment([], file("f1", "a"), undefined, "kari", AT)[0]?.kind).toBe("other");
  });

  it("refuses the same file twice on an entry", () => {
    const linked = linkAttachment([], file("f1", "a"), "receipt", "kari", AT);
    expect(() => linkAttachment(linked, file("f1", "b"), "receipt", "kari", AT)).toThrow(/"f1" is already linked/);
    expect(() => linkAttachment(linked, file("f2", "A"), "receipt", "kari", AT)).toThrow(
      /"f2" \(f2.pdf\) is the same file as "f1"/,
    );
    expect(linkAttachment(linked, file("f2", "b"), "receipt", "kari", AT)).toHaveLength(2);
    const twice = [...linked, { ...linked[0]!, id: "f9" }];
    expect(duplicateAttachments(twice).map((group) => group.map((a) => a.id))).toEqual([["f1", "f9"]]);
  });

  it("validates the metadata the host supplies", () => {
    expect(() => validateAttachmentFile(file("f1", "a", { sha256: "abc" }))).toThrow(/64 hex characters/);
    expect(() => validateAttachmentFile(file("f1", "a", { sizeBytes: 1.5 }))).toThrow(/whole number of bytes/);
    expect(() => validateAttachmentFile(file("f1", "a", { mediaType: "pdf" }))).toThrow(/media type/);
    expect(() => validateAttachmentFile(file("f1", "a", { region: { page: 0 } }))).toThrow(/page/);
    expect(() => validateAttachmentFile(file("f1", "a", { region: { box: [0, 0, 1001, 10] } }))).toThrow(/thousandths/);
    expect(() => linkAttachment([], file("f1", "a"), "photo" as never, "kari", AT)).toThrow(
      /Kinds: invoice, receipt, contract, bank-statement, other/,
    );
    expect(() => linkAttachment([], file("f1", "a"), "receipt", " ", AT)).toThrow(/who linked it/);
    expect(checkAttachmentKind("bank-statement")).toBe("bank-statement");
  });

  it("is evidenced only when every required kind is present", () => {
    let list: Attachment[] = linkAttachment([], file("f1", "a"), "other", "kari", AT);
    expect(missingKinds(list, ["receipt", "contract", "receipt"])).toEqual(["receipt", "contract"]);
    expect(() => assertEvidenced(list, ["receipt"])).toThrow(/not evidenced: missing receipt/);
    list = setAttachmentKind(list, "f1", "receipt");
    expect(isEvidenced(list, ["receipt"])).toBe(true);
    expect(() => assertEvidenced(list, ["receipt"])).not.toThrow();
    expect(isEvidenced([], [])).toBe(true);
    expect(() => setAttachmentKind(list, "nope", "receipt")).toThrow(/No attachment "nope" on this entry. Linked: f1/);
  });

  it("keeps the evidence of a locked entry", () => {
    const list = linkAttachment([], file("f1", "a"), "receipt", "kari", AT);
    expect(() => removeAttachment(list, "f1", true)).toThrow(/locked: attachment "f1" \(f1.pdf\) cannot be removed/);
    expect(() => setAttachmentKind(list, "f1", "other", true)).toThrow(/locked/);
    expect(removeAttachment(list, "f1")).toEqual([]);
    // More evidence can still be added.
    expect(linkAttachment(list, file("f2", "b"), "contract", "per", AT)).toHaveLength(2);
  });
});
