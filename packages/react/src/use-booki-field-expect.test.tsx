import { cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { createBookiAgent, useBookiField } from "./index.js";

afterEach(() => cleanup());

// `expect` compares a field's `value`. Each useBookiField kind keeps its own key
// (`minor`, `code`, `date`, `account`) and also exposes `value`, so a check before a
// save works on every kind, as it does on AmountField.

const options = [
  { value: "100", label: "Drift" },
  { value: "200", label: "Prosjekt" },
];

function Screen() {
  const [minor, setMinor] = useState(0);
  const [code, setCode] = useState("100");
  const [date, setDate] = useState("");
  const [account, setAccount] = useState("");
  return (
    <>
      {useBookiField({ kind: "amount", value: minor, label: "Beløp", onValueChange: setMinor }, () => (
        <input />
      ))}
      {useBookiField({ kind: "code", value: code, options, label: "Retning", onValueChange: setCode }, () => (
        <select />
      ))}
      {useBookiField({ kind: "date", value: date, label: "Forfall", onValueChange: setDate }, () => (
        <input />
      ))}
      {useBookiField(
        { kind: "account", value: account, allowEmpty: true, label: "Konto", onValueChange: setAccount },
        () => (
          <input />
        ),
      )}
    </>
  );
}

type Result = { ok: boolean; error?: { message: string } };

const kinds = [
  { ref: "Beløp", set: "setMinor", good: 12_500, bad: 99, badText: /Beløp \(c\d+\) is 12500, not 99\./ },
  { ref: "Retning", set: "setCode", good: "200", bad: "100", badText: /Retning \(c\d+\) is "200", not "100"\./ },
  {
    ref: "Forfall",
    set: "setDate",
    good: "2026-03-03",
    bad: "2026-03-04",
    badText: /Forfall \(c\d+\) is "2026-03-03", not "2026-03-04"\./,
  },
  { ref: "Konto", set: "setAccount", good: "2400", bad: "1920", badText: /Konto \(c\d+\) is "2400", not "1920"\./ },
] as const;

describe("expect on every useBookiField kind", () => {
  for (const kind of kinds) {
    it(`${kind.ref} (${kind.set}): passes for the value just set and fails for another, in English`, async () => {
      const agent = createBookiAgent({ agentId: "test" });
      render(<Screen />);
      const set = (await agent.act({ steps: [{ ref: kind.ref, action: kind.set, args: [kind.good] }] })) as Result;
      expect(set.ok).toBe(true);
      const pass = (await agent.act({ steps: [{ ref: kind.ref, action: "expect", args: [kind.good] }] })) as Result;
      expect(pass.ok).toBe(true);
      const fail = (await agent.act({ steps: [{ ref: kind.ref, action: "expect", args: [kind.bad] }] })) as Result;
      expect(fail.ok).toBe(false);
      expect(fail.error?.message).toMatch(kind.badText);
    });

    it(`${kind.ref} (${kind.set}): passes and fails in Norwegian`, async () => {
      const agent = createBookiAgent({ agentId: "test", language: "nb" });
      render(<Screen />);
      await agent.act({ steps: [{ ref: kind.ref, action: kind.set, args: [kind.good] }] });
      const pass = (await agent.act({ steps: [{ ref: kind.ref, action: "expect", args: [kind.good] }] })) as Result;
      expect(pass.ok).toBe(true);
      const fail = (await agent.act({ steps: [{ ref: kind.ref, action: "expect", args: [kind.bad] }] })) as Result;
      expect(fail.ok).toBe(false);
      expect(fail.error?.message).toMatch(/ er .*, ikke /);
      expect(fail.error?.message).not.toContain(" is ");
    });
  }

  it("the snapshot keeps each kind's own key beside value", () => {
    const agent = createBookiAgent();
    render(<Screen />);
    const entries = agent.snapshot();
    expect(entries.find((c) => c.label === "Beløp")).toMatchObject({ minor: 0, value: 0 });
    expect(entries.find((c) => c.label === "Retning")).toMatchObject({ code: "100", value: "100" });
    expect(entries.find((c) => c.label === "Forfall")).toMatchObject({ date: "", value: "" });
    expect(entries.find((c) => c.label === "Konto")).toMatchObject({ account: "", value: "" });
  });
});

describe("a field with group: false", () => {
  function Konto() {
    return useBookiField(
      { kind: "account", value: "", allowEmpty: true, label: "Konto (valgfritt)", group: false },
      ({ change }) => (
        <>
          <label htmlFor="konto">Konto (valgfritt)</label>
          <input id="konto" onBlur={(e) => change(e.target.value)} />
        </>
      ),
    );
  }

  it("leaves the visible label as the only accessible name, so getByLabelText finds the input alone", () => {
    const { container } = render(<Konto />);
    const found = screen.getByLabelText("Konto (valgfritt)");
    expect(found.tagName).toBe("INPUT");
    expect(container.querySelector('[data-slot="field-account"]')!.hasAttribute("aria-label")).toBe(false);
  });

  it("still gives the agent the same label", () => {
    const agent = createBookiAgent();
    render(<Konto />);
    const entry = agent.snapshot().find((c) => c.component === "field-account")!;
    expect(entry.label).toBe("Konto (valgfritt)");
    expect(entry.actions).toContain("setAccount");
  });
});
