import type { Deal, PipelineStage } from "@booki/core/pipeline";
import { Button } from "@ui-sdk/react/button";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { actAndRecord, type AgentDecisionRow } from "@booki/primitives/agent-policy";
import { AmountField } from "./amount-field.js";
import { attachAudit, createBookiAgent, registerTools } from "./booki-agent.js";
import { ClientRequests } from "./client-requests.js";
import { DealPipeline } from "./deal-pipeline.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => {
  cleanup();
  delete (document as { modelContext?: unknown }).modelContext;
});

type Result = { ok: boolean; steps?: unknown[]; error?: { step: number; message: string } };
type Tool = {
  name: string;
  execute: (input: unknown, context?: { signal?: AbortSignal }) => Promise<Result> | unknown;
};

const draft = {
  title: "Leases",
  recipientName: "Ola Berg",
  recipientEmail: "ola@example.test",
};

function webmcp(answer: "promise" | "nothing" = "promise") {
  const tools: Tool[] = [];
  (document as { modelContext?: unknown }).modelContext = {
    registerTool: (tool: Tool) => {
      tools.push(tool);
      return answer === "promise" ? Promise.resolve() : undefined;
    },
  };
  return tools;
}

describe("a press on a button that is a person's decision", () => {
  it("is refused by name and audited, after the steps before it have run", async () => {
    const rows: AgentDecisionRow[] = [];
    const agent = createBookiAgent({ agentId: "assistant", audit: (row) => rows.push(row) });
    render(
      <BookiLocaleProvider defaultCountry="US">
        <ClientRequests actor="kari" />
      </BookiLocaleProvider>,
    );
    const result = (await agent.act({
      steps: [
        { ref: "Client requests", action: "draftRequest", args: [draft] },
        { ref: "Client requests", action: "press", args: ["Send"] },
      ],
    })) as Result;
    expect(result.ok).toBe(false);
    expect(result.error).toEqual({
      step: 1,
      message:
        "This is a person's decision and an agent may not make it, whatever the app allows: Sending to the client needs a person.",
    });
    // The draft before it was made.
    expect(agent.snapshot().find((c) => c.component === "client-requests")).toMatchObject({
      tracker: [{ id: "R-1", status: "draft" }],
    });
    expect(rows).toEqual([
      {
        actor: "agent:assistant",
        action: "agent.person-only",
        target: "Client requests",
        detail: "client-requests.press: Sending to the client needs a person",
      },
    ]);
  });

  it("is said in the agent's language, and recorded once through actAndRecord", async () => {
    const rows: AgentDecisionRow[] = [];
    const audit = (row: AgentDecisionRow) => rows.push(row);
    const agent = createBookiAgent({ agentId: "assistant", audit, language: "nb" });
    render(
      <BookiLocaleProvider defaultCountry="US">
        <ClientRequests
          actor="kari"
          defaultRequests={[
            {
              id: "R-1",
              title: "Leases",
              status: "draft",
              recipient: { name: "Ola", email: "ola@example.test" },
              reminders: 0,
              createdBy: "kari",
            },
          ]}
        />
      </BookiLocaleProvider>,
    );
    const result = (await actAndRecord(
      agent as never,
      { steps: [{ ref: "Client requests", action: "press", args: ["Send"] }] } as never,
      { audit, agentId: "assistant" },
    )) as Result;
    expect(result.error?.message).toMatch(/persons beslutning/);
    expect(rows.map((row) => row.action)).toEqual(["agent.person-only"]);
  });
});

describe('registerTools with allow: "bridge"', () => {
  it("names the tools with the prefix and answers in the agent's language", async () => {
    const tools = webmcp();
    const agent = createBookiAgent({ agentId: "assistant", language: "nb" });
    const unregister = registerTools(agent, { allow: "bridge", prefix: "acme" });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <AmountField aria-label="Beløp" />
      </BookiLocaleProvider>,
    );
    expect(tools.map((tool) => tool.name)).toEqual(["acme_act", "acme_query", "acme_snapshot"]);
    const act = tools.find((tool) => tool.name === "acme_act")!;
    const refused = (await act.execute({ steps: [{ ref: "Beløp", action: "setMinor", args: [12.5] }] })) as Result;
    expect(refused.error?.message).toMatch(/heltall/);
    expect(((await act.execute({ steps: [{ ref: "Beløp", action: "setMinor", args: [4200] }] })) as Result).ok).toBe(
      true,
    );
    unregister();
  });

  it("asks the person once for a marked step: the bridge decides", async () => {
    webmcp();
    let asked = 0;
    const agent = createBookiAgent({
      agentId: "assistant",
      allow: () => {
        asked += 1;
        return true;
      },
    });
    const tools = webmcp();
    registerTools(agent, { allow: "bridge" });
    render(<Button data-agent-confirm="Pays the invoice">Pay</Button>);
    const act = tools.find((tool) => tool.name === "act")!;
    const result = (await act.execute({ steps: [{ ref: "Pay", action: "press" }] })) as Result;
    expect(result.ok).toBe(true);
    expect(asked).toBe(1);
  });

  it("records a control's own refusal with audit, and registers where registerTool returns nothing", async () => {
    const tools = webmcp("nothing");
    const rows: AgentDecisionRow[] = [];
    const agent = createBookiAgent({ agentId: "assistant" });
    registerTools(agent, { allow: "bridge", audit: (row) => rows.push(row), agentId: "browser" });
    render(
      <BookiLocaleProvider defaultCountry="US">
        <AmountField aria-label="Amount" />
      </BookiLocaleProvider>,
    );
    expect(tools).toHaveLength(3);
    await tools
      .find((tool) => tool.name === "act")!
      .execute({ steps: [{ ref: "Amount", action: "setMinor", args: [12.5] }] });
    expect(rows[0]).toMatchObject({ actor: "agent:browser", action: "agent.failed", target: "Amount" });
  });

  it("answers a call without steps with ui-sdk's sentence, instead of throwing", async () => {
    const tools = webmcp();
    const rows: AgentDecisionRow[] = [];
    const agent = createBookiAgent({ agentId: "assistant", language: "nb" });
    registerTools(agent, { allow: "bridge", audit: (row) => rows.push(row), agentId: "browser" });
    render(
      <BookiLocaleProvider defaultCountry="US">
        <AmountField aria-label="Amount" />
      </BookiLocaleProvider>,
    );
    // What a model sends when it gets the shape wrong.
    const result = (await tools.find((tool) => tool.name === "act")!.execute({ step: [] })) as {
      ok: boolean;
      error: { message: string };
    };
    expect(result.ok).toBe(false);
    expect(result.error.message).toMatch(/^act tar \{ "steps"/);
    await expect(agent.act({ foo: 1 } as never)).resolves.toMatchObject({ ok: false });
    await expect(agent.act(null as never)).resolves.toMatchObject({ ok: false });
    expect(rows[0]).toMatchObject({ action: "agent.failed", target: "act" });
    // The sentence quotes what was sent, which can be an account number: the row does not.
    await tools.find((tool) => tool.name === "act")!.execute({ steps: [], kid: "12345678903" });
    expect(JSON.stringify(rows)).not.toContain("12345678903");
  });

  it("refuses a prefix with a gate of its own", () => {
    webmcp();
    const agent = createBookiAgent({ agentId: "assistant" });
    expect(() => registerTools(agent, { allow: () => true, prefix: "acme" })).toThrow(/prefix needs allow: "bridge"/);
  });
});

describe("attachAudit on a list of records", () => {
  it("says which record and field changed, and the step that did it", async () => {
    const stages: PipelineStage[] = [
      { id: "lead", name: "Lead", probability: 10 },
      { id: "quote", name: "Quote", probability: 50 },
    ];
    const deals: Deal[] = [
      { id: "D-1", name: "Licence", stageId: "lead", valueMinor: null, currency: "NOK", valueStatus: "unknown" },
      { id: "D-2", name: "Support", stageId: "lead", valueMinor: null, currency: "NOK", valueStatus: "unknown" },
    ];
    const agent = createBookiAgent({ agentId: "assistant" });
    const rows: { action: string; detail?: string }[] = [];
    attachAudit(agent, (row) => rows.push(row), "assistant");
    render(
      <BookiLocaleProvider defaultCountry="US">
        <DealPipeline stages={stages} defaultDeals={deals} today="2026-11-24" />
      </BookiLocaleProvider>,
    );
    await agent.act({ steps: [{ ref: "Sales pipeline", action: "moveDeal", args: ["D-2", "quote"] }] });
    const row = rows.find((item) => item.action === "deal-pipeline.deals")!;
    expect(row.detail).toMatch(/^moveDeal: D-2: stageId="?quote"? \(was "?lead"?\), stageChangedAt=/);
    expect(row.detail).not.toMatch(/D-1/);
  });
});

describe("expect, the bridge's check", () => {
  it("asks no one, and a failed check writes no audit row while a refused change does", async () => {
    const asked: string[] = [];
    const rows: AgentDecisionRow[] = [];
    const agent = createBookiAgent({
      agentId: "test",
      allow: async (step) => {
        asked.push(step.action);
        return true;
      },
    });
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <AmountField defaultValue={100_00} aria-label="Beløp" />
      </BookiLocaleProvider>,
    );
    const record = { audit: (row: AgentDecisionRow) => rows.push(row), agentId: "test" };
    const holds = (await actAndRecord(
      agent,
      { steps: [{ ref: "Beløp", action: "expect", args: [100_00] }] },
      record,
    )) as Result;
    const fails = (await actAndRecord(
      agent,
      { steps: [{ ref: "Beløp", action: "expect", args: [1] }] },
      record,
    )) as Result;
    expect(holds.ok).toBe(true);
    expect(fails.ok).toBe(false);
    expect(asked).toEqual([]);
    expect(rows).toEqual([]);
    const refused = (await actAndRecord(
      agent,
      { steps: [{ ref: "Beløp", action: "setMinor", args: [1.5] }] },
      record,
    )) as Result;
    expect(refused.ok).toBe(false);
    expect(rows.map((row) => row.action)).toEqual(["agent.failed"]);
  });
});
