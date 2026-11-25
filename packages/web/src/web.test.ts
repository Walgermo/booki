import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import "./amount-field.js";
import { personOnly } from "@booki-aui/primitives/person-only";
import "./voucher-composer.js";
import { createBookiAgent } from "./agent.js";
import { createAgentCursor, type BookiAgentCursorElement } from "./agent-cursor.js";

afterEach(() => {
  document.body.innerHTML = "";
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

type Entry = { ref: string; component: string; actions: string[]; value?: number; minor?: number };

describe("@booki-aui/web", () => {
  it("registers Booki's controls as custom elements an agent operates by name", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    document.body.innerHTML = `
      <booki-amount-field aria-label="Beløp" currency="NOK" locale="nb-NO">
        <booki-amount-field-input><input /></booki-amount-field-input>
      </booki-amount-field>`;
    await settle();

    const entry = () => agent.snapshot().find((c) => c.component === "amount-field") as unknown as Entry;
    expect(entry().actions).toEqual(expect.arrayContaining(["setMinor", "clear"]));

    const result = (await agent.act({ steps: [{ ref: entry().ref, action: "setMinor", args: [1_550_000] }] })) as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(entry().minor).toBe(1_550_000);
  });

  it("keeps the accounting rules in the control, without React", async () => {
    const agent = createBookiAgent({ agentId: "test" });
    document.body.innerHTML = `<booki-amount-field aria-label="Beløp"><booki-amount-field-input><input /></booki-amount-field-input></booki-amount-field>`;
    await settle();
    const ref = agent.snapshot().find((c) => c.component === "amount-field")!.ref;
    const refused = (await agent.act({ steps: [{ ref, action: "setMinor", args: [12.5] }] })) as { ok: boolean };
    expect(refused.ok).toBe(false);
  });

  it("keeps a person's decision from an agent, whatever the app's allow says", async () => {
    const rows: { action: string }[] = [];
    const agent = createBookiAgent({ allow: () => true, audit: (row) => rows.push(row) });
    document.body.innerHTML = `
      <booki-amount-field aria-label="Beløp" data-agent-confirm="${personOnly("Setting the limit needs a person")}">
        <booki-amount-field-input><input /></booki-amount-field-input>
      </booki-amount-field>`;
    await settle();
    const entry = () => agent.snapshot().find((c) => c.component === "amount-field") as unknown as Entry;
    const before = entry().minor;
    const result = (await agent.act({ steps: [{ ref: entry().ref, action: "setMinor", args: [100] }] })) as {
      ok: boolean;
      error?: { message: string };
    };
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/person's decision/);
    expect(entry().minor).toBe(before);
    expect(rows.map((row) => row.action)).toEqual(["agent.person-only"]);
  });

  it("emits change events a page listens to, like a native input", async () => {
    createBookiAgent({ agentId: "test" });
    document.body.innerHTML = `<booki-amount-field aria-label="Beløp"><booki-amount-field-input><input /></booki-amount-field-input></booki-amount-field>`;
    await settle();
    const element = document.querySelector("booki-amount-field") as HTMLElement & { value?: number };
    const seen: unknown[] = [];
    element.addEventListener("valuechange", (event) => seen.push((event as CustomEvent).detail));
    const agent = createBookiAgent({ agentId: "test-2" });
    const ref = agent.snapshot().find((c) => c.component === "amount-field")!.ref;
    await agent.act({ steps: [{ ref, action: "setMinor", args: [25_000] }] });
    expect(seen.length).toBeGreaterThan(0);
  });

  it("shows the agent's pointer on the field before the step runs, without React", async () => {
    const cursor = createAgentCursor({ travel: 0, press: 0, linger: 10_000 });
    let phaseWhenAllowed = "";
    const agent = createBookiAgent({
      agentId: "test",
      allow: cursor.wrap(() => {
        phaseWhenAllowed = cursor.state().phase;
        return true;
      }),
    });
    document.body.innerHTML = `
      <booki-amount-field aria-label="Beløp"><booki-amount-field-input><input /></booki-amount-field-input></booki-amount-field>
      <booki-agent-cursor label="Agent"></booki-agent-cursor>`;
    (document.querySelector("booki-agent-cursor") as BookiAgentCursorElement).cursor = cursor;
    await settle();
    const ref = agent.snapshot().find((c) => c.component === "amount-field")!.ref;
    await agent.act({ steps: [{ ref, action: "setMinor", args: [12_500] }] });
    expect(phaseWhenAllowed).toBe("press");
    const overlay = document.querySelector('[data-slot="agent-cursor"]')!;
    expect(overlay.getAttribute("data-phase")).toBe("done");
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector('[data-slot="agent-cursor-label"]')?.textContent).toMatch(/Agent · set minor 12500/);
  });

  it("imports no React anywhere", () => {
    const src = path.dirname(new URL(import.meta.url).pathname);
    for (const file of readdirSync(src).filter((f) => f.endsWith(".ts"))) {
      expect(readFileSync(path.join(src, file), "utf8"), file).not.toMatch(/from "(react|react-dom|@ui-sdk\/react[^"]*|@booki-aui\/react[^"]*)"/);
    }
  });
});
