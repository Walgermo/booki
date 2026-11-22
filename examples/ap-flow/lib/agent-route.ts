import Anthropic from "@anthropic-ai/sdk";
// Framework-free tool definitions: a server route has no React to load.
import { agentTools } from "@ui-sdk/core/agent";

/**
 * The server half of the model agent: a fixed-purpose proxy to the Claude
 * Messages API. The model, the instructions and the three tools (snapshot,
 * query, act) are set here, never by the caller. The tools run in the
 * person's browser against the page's bridge; each request is one model turn
 * and the page drives the loop (lib/model-agent.ts).
 *
 * Needs ANTHROPIC_API_KEY on the server (.env.local). Without it, GET says the
 * model agent is off and the page offers the scripted agent only.
 */

const MODEL = "claude-opus-5-5";
const MAX_MESSAGES = 40;
const MAX_BODY_BYTES = 200_000;

const SYSTEM = `You are the bookkeeping agent of a small Norwegian company, working on its accounts-payable screen: a supplier invoice inbox, a payment batch and a bank reconciliation. You work for the person signed in, and they watch every change you make.

You operate the screen only through three tools: snapshot (read every control and its actions), query (look something up in a list) and act (call a control's actions). Every change you make goes to the server with your own credential, and the server decides.

How to work:
- Start with snapshot. Use the refs and action names it gives you; do not invent actions.
- Amounts are integers in minor units (øre). 1 550,00 kr is 155000.
- Accounts come from the inbox's chart. Code an invoice with proposeCoding; if nothing fits, say so instead of guessing.
- A second copy of an invoice (duplicateOf) is not yours to reject: propose the rejection with the reason, and a person decides.
- approveUnderRule approves an invoice only when the company's rule covers it. When it says a person approves, leave it.
- Approving and rejecting invoices, approving and releasing payments, and approving bank matches are a person's. If a step answers that it needs a person, or the server says no, do not retry or look for another route.
- In the bank reconciliation, suggest a match only when one open post fits a bank line. A wrong match costs more than an open one.
- Bank account numbers and payment references read as [redacted]. That is intended.

When you are done, answer the person in Norwegian, in two or three plain sentences: what you did, and what is waiting for them.`;

const tools: Anthropic.Beta.BetaTool[] = agentTools.map((tool) => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.inputSchema as Anthropic.Beta.BetaTool["input_schema"],
}));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

function validMessages(value: unknown): value is Anthropic.Beta.BetaMessageParam[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= MAX_MESSAGES &&
    value.every(
      (message) =>
        message &&
        typeof message === "object" &&
        (message.role === "user" || message.role === "assistant") &&
        (typeof message.content === "string" || Array.isArray(message.content)),
    ) &&
    value[0].role === "user"
  );
}

export async function handleAgent(request: Request): Promise<Response> {
  const enabled = Boolean(process.env.ANTHROPIC_API_KEY);
  if (request.method === "GET") return json({ enabled, model: MODEL });
  if (request.method !== "POST") return json({ error: "Bruk GET eller POST." }, 405);
  if (!enabled) return json({ error: "Modellagenten er av: serveren har ingen ANTHROPIC_API_KEY." }, 503);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Samtalen er for lang. Start en ny." }, 413);
  let messages: unknown;
  try {
    messages = (JSON.parse(raw) as { messages?: unknown }).messages;
  } catch {
    return json({ error: "Kroppen er ikke JSON." }, 400);
  }
  if (!validMessages(messages)) return json({ error: "Send { messages } som starter med en brukermelding." }, 400);

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: SYSTEM,
      tools,
      messages,
    });
    return json({
      content: response.content,
      stop_reason: response.stop_reason,
      stop_details: response.stop_details ?? null,
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError)
      return json({ error: "Modellen er overbelastet. Prøv igjen snart." }, 429);
    if (error instanceof Anthropic.AuthenticationError) return json({ error: "Serverens API-nøkkel ble avvist." }, 500);
    if (error instanceof Anthropic.APIError)
      return json({ error: `Modellen svarte med en feil (${error.status ?? "ukjent"}).` }, 502);
    return json({ error: "Modellagenten feilet." }, 500);
  }
}
