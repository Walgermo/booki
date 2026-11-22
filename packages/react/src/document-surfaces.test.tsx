import type { SignableDocument } from "@booki/core/document-signoff";
import type { StackSheet } from "@booki/core/sheet-stack";
import { mount } from "@ui-sdk/core/testing";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { BookiAccessProvider } from "./access.js";
import { createBookiAgent } from "./booki-agent.js";
import { DocumentSignoff, documentSignoff } from "./document-signoff.js";
import { BookiLocaleProvider } from "./locale.js";
import { SheetStack } from "./sheet-stack.js";

afterEach(() => cleanup());

type Result = { ok: boolean; value?: unknown; error?: { message: string } };

const doc = (over: Partial<SignableDocument> = {}): SignableDocument => ({
  id: "05.3",
  version: 3,
  saveState: "saved",
  openPoints: ["Bank confirmation outstanding"],
  signatures: [],
  ...over,
});

function signoff(ui: React.ReactElement) {
  const agent = createBookiAgent({ agentId: "test" });
  render(<BookiLocaleProvider defaultCountry="US">{ui}</BookiLocaleProvider>);
  const entry = () =>
    agent.snapshot().find((c) => c.component === "document-signoff") as unknown as Record<string, any>;
  const act = (action: string, args: unknown[] = []) =>
    agent.act({ steps: [{ ref: entry().ref, action, args }] }) as Promise<Result>;
  const button = (name: string) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === name || b.getAttribute("aria-label") === name,
    );
  return { agent, entry, act, button };
}

describe("DocumentSignoff", () => {
  it("lets an agent read the levels and ask, never sign", async () => {
    const { entry, act } = signoff(<DocumentSignoff defaultDocument={doc()} actor="nina" />);
    expect(entry().actions).toEqual(["assertSignable"]);
    expect(entry()).toMatchObject({ version: 3, signable: true, openPoints: ["Bank confirmation outstanding"] });
    expect(entry().levels.map((level: { mark: string }) => level.mark)).toEqual(["unsigned", "unsigned", "unsigned"]);
    expect((await act("assertSignable")).ok).toBe(true);
    expect((await act("sign", ["performed"])).ok).toBe(false);
  });

  it("signs with the open points on a person's click, and holds review for another person", () => {
    const changes: SignableDocument[] = [];
    const { button } = signoff(
      <DocumentSignoff defaultDocument={doc()} actor="nina" onDocumentChange={(next) => changes.push(next)} />,
    );
    fireEvent.click(button("Sign as performed")!);
    expect(changes.at(-1)?.signatures[0]).toMatchObject({
      level: "performed",
      by: "nina",
      version: 3,
      openPoints: ["Bank confirmation outstanding"],
    });
    fireEvent.click(button("Sign as reviewed")!);
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/another person reviews it/);
  });

  it("shows a changed-after mark and needs a reason to withdraw", () => {
    const signed = doc({
      version: 4,
      signatures: [{ level: "performed", by: "nina", at: "2026-11-20T10:00:00Z", version: 3, openPoints: [] }],
    });
    const { entry, button } = signoff(<DocumentSignoff defaultDocument={signed} actor="nina" />);
    expect(entry().levels[0]).toMatchObject({ mark: "changed-after", version: 3 });
    expect(document.body.textContent).toMatch(/Changed after sign-off/);
    fireEvent.click(button("Withdraw: Performed")!);
    expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/at least 20 characters/);
  });

  it("stops only for technical facts, and says them", async () => {
    const { entry, act, button } = signoff(
      <DocumentSignoff defaultDocument={doc({ saveState: "pending" })} actor="nina" />,
    );
    expect(entry()).toMatchObject({ signable: false });
    expect(button("Sign as performed")).toBeUndefined();
    expect((await act("assertSignable")).error?.message).toMatch(/still saving/);
  });

  it("shows a role that may not sign why, instead of a button", () => {
    render(
      <BookiLocaleProvider defaultCountry="US">
        <BookiAccessProvider actor={{ id: "ola", roles: ["eqcr"] }}>
          <DocumentSignoff defaultDocument={doc()} />
        </BookiAccessProvider>
      </BookiLocaleProvider>,
    );
    expect([...document.querySelectorAll("button")].map((b) => b.textContent)).not.toContain("Sign as performed");
    expect(document.body.textContent).toMatch(/may not do "audit\.prepare"/);
  });

  it("reports the click as the source of the change (ui-sdk mount)", async () => {
    const view = mount(
      documentSignoff,
      { defaultDocument: doc(), actor: "nina" },
      `<root><sign value="performed#sign">Sign</sign></root>`,
    );
    try {
      await view.click(view.part("sign", "performed#sign")!);
      expect(view.changes.at(-1)).toMatchObject({ key: "document", reason: "sign-performed", source: "mouse" });
    } finally {
      view.unmount();
    }
  });
});

describe("SheetStack", () => {
  const sheets: StackSheet[] = [
    { key: "page", title: "05.3 Receivables" },
    { key: "action", title: "05.3.2 Confirmations" },
    { key: "gl", title: "General ledger 1500", dockable: true },
  ];

  it("lets an agent go back and close, and reads what is open", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    const seen: StackSheet[][] = [];
    render(
      <BookiLocaleProvider defaultCountry="US">
        <SheetStack
          defaultSheets={sheets}
          onSheetsChange={(next) => seen.push(next)}
          renderSheet={(sheet) => <p>{sheet.title} body</p>}
        />
      </BookiLocaleProvider>,
    );
    const entry = () => agent.snapshot().find((c) => c.component === "sheet-stack") as unknown as Record<string, any>;
    expect(entry().actions).toEqual(["back", "close"]);
    expect(entry()).toMatchObject({ top: "gl" });
    expect(entry().open.map((sheet: { key: string }) => sheet.key)).toEqual(["page", "action", "gl"]);
    expect(((await agent.act({ steps: [{ ref: entry().ref, action: "close", args: [] }] })) as Result).ok).toBe(true);
    expect(seen.at(-1)?.map((sheet) => sheet.key)).toEqual(["page", "action"]);
    expect(
      ((await agent.act({ steps: [{ ref: entry().ref, action: "back", args: ["nope"] }] })) as Result).error?.message,
    ).toMatch(/Open: page, action/);
    expect(((await agent.act({ steps: [{ ref: entry().ref, action: "back", args: ["page"] }] })) as Result).ok).toBe(
      true,
    );
    expect(seen.at(-1)?.map((sheet) => sheet.key)).toEqual(["page"]);
  });

  it("keeps only the top sheet live, and Escape closes it", () => {
    const seen: StackSheet[][] = [];
    render(
      <BookiLocaleProvider defaultCountry="US">
        <SheetStack
          defaultSheets={sheets.slice(0, 2)}
          onSheetsChange={(next) => seen.push(next)}
          renderSheet={(sheet) => <input aria-label={`${sheet.title} field`} />}
        />
      </BookiLocaleProvider>,
    );
    const contents = [...document.querySelectorAll('[data-slot="sheet-stack-content"]')];
    expect(contents.map((node) => node.hasAttribute("inert"))).toEqual([true, false]);
    expect(document.querySelector('[aria-label="Back to 05.3 Receivables"]')).not.toBeNull();
    fireEvent.keyDown(document.querySelector('[aria-label="05.3.2 Confirmations field"]')!, { key: "Escape" });
    expect(seen.at(-1)?.map((sheet) => sheet.key)).toEqual(["page"]);
  });
});
