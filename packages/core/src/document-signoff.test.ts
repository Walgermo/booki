import { describe, expect, it } from "vitest";
import {
  signDocument,
  signObstacles,
  signoffStates,
  withdrawSignature,
  type SignableDocument,
} from "./document-signoff.js";
import { BookiError } from "./msg.js";

const doc = (over: Partial<SignableDocument> = {}): SignableDocument => ({
  id: "05.3",
  version: 4,
  saveState: "saved",
  openPoints: [],
  signatures: [],
  ...over,
});
const nina = { id: "nina", name: "Nina" };
const kari = { id: "kari", name: "Kari" };

describe("document sign-off", () => {
  it("signs with the open points, and never lets them block", () => {
    const signed = signDocument(
      doc({ openPoints: ["Bekreftelse fra bank mangler"] }),
      "performed",
      nina,
      "2026-11-22T09:00:00Z",
    );
    expect(signoffStates(signed)[0]).toMatchObject({
      mark: "signed",
      signature: { by: "nina", version: 4, openPoints: ["Bekreftelse fra bank mangler"] },
    });
  });

  it("stops only for technical facts", () => {
    expect(signObstacles(doc({ saveState: "pending" }))).toEqual(["signoff.saving"]);
    expect(signObstacles(doc({ saveState: "conflict", hasContent: false }))).toEqual([
      "signoff.conflict",
      "signoff.empty",
    ]);
    expect(() => signDocument(doc({ saveState: "unsaved" }), "performed", nina, "t")).toThrow(/unsaved/);
  });

  it("needs the earlier level first, and another person to review", () => {
    expect(() => signDocument(doc(), "reviewed", kari, "t")).toThrow(/needs "performed"/);
    const performed = signDocument(doc(), "performed", nina, "t");
    expect(() => signDocument(performed, "reviewed", nina, "t")).toThrow(/another person/);
    expect(signoffStates(signDocument(performed, "reviewed", kari, "t"))[1]!.mark).toBe("signed");
  });

  it("marks a signature changed after a later save, and never withdraws it on its own", () => {
    const signed = signDocument(doc(), "performed", nina, "t");
    const edited = { ...signed, version: 5 };
    expect(signoffStates(edited)[0]).toMatchObject({ mark: "changed-after", signature: { version: 4 } });
    expect(signoffStates({ ...signed, basisChanged: ["performed"] })[0]!.mark).toBe("basis-changed");
    const again = signDocument(edited, "performed", nina, "t2");
    expect(signoffStates(again)[0]).toMatchObject({ mark: "signed", signature: { version: 5 } });
    expect(again.signatures).toHaveLength(2);
  });

  it("withdraws with a reason, taking the levels that rest on it", () => {
    const reviewed = signDocument(signDocument(doc(), "performed", nina, "t"), "reviewed", kari, "t");
    expect(() => withdrawSignature(reviewed, "performed", "nina", "t", "feil")).toThrow(/at least 20/);
    const out = withdrawSignature(reviewed, "performed", "nina", "t", "Signert på feil versjon av utvalget");
    expect(signoffStates(out).map((state) => state.mark)).toEqual(["unsigned", "unsigned", "unsigned"]);
    expect(
      out.signatures.every((signature) => signature.withdrawn?.reason === "Signert på feil versjon av utvalget"),
    ).toBe(true);
  });
});

describe("blocking sign-off while points are open", () => {
  const rules = { blockOpenPoints: true };
  const withPoint = (over: Partial<SignableDocument> = {}) =>
    doc({ openPoints: ["Bekreftelse fra bank mangler"], ...over });

  it("is off by default: open points still go with the signature", () => {
    expect(signObstacles(withPoint())).toEqual([]);
    expect(signObstacles(withPoint(), { blockOpenPoints: false })).toEqual([]);
    expect(signDocument(withPoint(), "performed", nina, "t").signatures).toHaveLength(1);
  });

  it("lists the open-points obstacle only when blocked and points are open", () => {
    expect(signObstacles(withPoint(), rules)).toEqual(["signoff.open-points"]);
    expect(signObstacles(doc(), rules)).toEqual([]);
  });

  it("refuses each level while points are open, and names the count", () => {
    expect(() => signDocument(withPoint(), "performed", nina, "t", rules)).toThrow(/open point/);
    expect(() => signDocument(withPoint(), "performed", nina, "t", rules)).toThrow(/1 open point/);

    const performed = signDocument(doc(), "performed", nina, "t");
    expect(() => signDocument({ ...performed, openPoints: ["x"] }, "reviewed", kari, "t", rules)).toThrow(/open point/);

    const reviewed = signDocument(performed, "reviewed", kari, "t");
    expect(() => signDocument({ ...reviewed, openPoints: ["x", "y"] }, "approved", kari, "t", rules)).toThrow(
      /2 open point/,
    );
  });

  it("refuses with the message code and its params", () => {
    try {
      signDocument(withPoint(), "performed", nina, "t", rules);
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(BookiError);
      expect((error as BookiError).code).toBe("signoff.open-points");
      expect((error as BookiError).params).toEqual({ id: "05.3", count: 1 });
    }
  });

  it("signs once the points are closed", () => {
    const signed = signDocument(doc(), "performed", nina, "t", rules);
    expect(signoffStates(signed)[0]).toMatchObject({ mark: "signed" });
  });

  it("puts the technical obstacles first", () => {
    expect(signObstacles(withPoint({ saveState: "unsaved" }), rules)).toEqual([
      "signoff.unsaved",
      "signoff.open-points",
    ]);
    expect(signObstacles(withPoint({ hasContent: false }), rules)).toEqual(["signoff.empty", "signoff.open-points"]);
    expect(() => signDocument(withPoint({ saveState: "unsaved" }), "performed", nina, "t", rules)).toThrow(/unsaved/);
  });

  it("never blocks withdrawing a signature, even with points open", () => {
    const signed = signDocument(doc(), "performed", nina, "t");
    const withOpen = { ...signed, openPoints: ["Bekreftelse fra bank mangler"] };
    const out = withdrawSignature(withOpen, "performed", "nina", "t", "Signert før bekreftelsen var mottatt");
    expect(signoffStates(out)[0]).toMatchObject({ mark: "unsigned" });
  });
});
