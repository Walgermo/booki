import Anthropic from "@anthropic-ai/sdk";
import { agentTools } from "@ui-sdk/core/agent";

/**
 * The one server piece of the live agent: a thin, fixed-purpose proxy to the
 * Claude Messages API. The model, the system prompt and the three tools are
 * set here, never by the caller. The tools themselves run in the visitor's
 * browser against the ui-sdk bridge, so each request is one model turn and the
 * page drives the loop.
 *
 * Web-standard Request/Response, so the same function serves Vite in
 * development (vite.config.ts) and a serverless function in production
 * (api/agent.ts).
 */

declare const process: { env: Record<string, string | undefined> };

const MODEL = "claude-opus-5-5";
const MAX_MESSAGES = 40;
const MAX_BODY_BYTES = 200_000;
const LIMIT = { requests: 30, windowMs: 10 * 60_000 };

const SYSTEM = `You are a bookkeeping assistant working inside an accounting screen. You operate the screen only through three tools: snapshot (read every control), query (look something up in a list) and act (call a control's actions). A person is watching the same screen and sees every change as you make it.

How to work:
- Start with snapshot unless you already have one from this conversation. Use the refs and action names it gives you; do not invent actions.
- Amounts are integers in minor units (øre or cents). 12 400,00 is 1240000. Never send decimals or formatted text as an amount.
- Accounts, tax codes, departments and projects come from closed lists. Use a value that is listed; if nothing fits, say so instead of guessing.
- Put every step you already know into one act call. When a step is refused, read the message: it says what rule was broken and usually what is allowed. Repair and try again once.
- Some steps are reserved for a person (posting, paying, approving). If a step answers that it needs a person, do not retry it or look for another route. Tell the person what is ready for them.
- If two options are equally plausible and nothing on the screen tells them apart, leave it and say why. A wrong match costs more than an open one.
- Bank account numbers and payment references read as [redacted]. That is intended; do not ask for them.

When you are done, answer in two or three plain sentences: what you changed, and what is waiting for the person. No headings or lists.`;

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

// Per-instance only. A serverless platform runs many instances, so put a real
// rate limiter (and a spend limit on the key) in front of this before a launch.
const seen = new Map<string, { count: number; resetAt: number }>();

function allowed(key: string): boolean {
  const now = Date.now();
  const entry = seen.get(key);
  if (!entry || entry.resetAt < now) {
    seen.set(key, { count: 1, resetAt: now + LIMIT.windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= LIMIT.requests;
}

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

export async function handleAgentRequest(request: Request): Promise<Response> {
  const enabled = Boolean(process.env.ANTHROPIC_API_KEY);

  if (request.method === "GET") return json({ enabled, model: MODEL });
  if (request.method !== "POST") return json({ error: "Use GET or POST." }, 405);
  if (!enabled) {
    return json({ error: "The live agent is off: the server has no ANTHROPIC_API_KEY." }, 503);
  }

  const who = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!allowed(who)) return json({ error: "Too many requests. Try again in a few minutes." }, 429);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "The conversation is too long. Start a new one." }, 413);

  let messages: unknown;
  try {
    messages = (JSON.parse(raw) as { messages?: unknown }).messages;
  } catch {
    return json({ error: "The request body is not JSON." }, 400);
  }
  if (!validMessages(messages)) return json({ error: "Send { messages } starting with a user message." }, 400);

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Thinking is always on for this model; effort is the control.
      output_config: { effort: "medium" },
      // If a safety classifier declines, the API re-runs the turn on a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // System prompt and tools are identical on every request: cache them.
      cache_control: { type: "ephemeral" },
      system: SYSTEM,
      tools,
      messages,
    });
    return json({
      content: response.content,
      stop_reason: response.stop_reason,
      stop_details: response.stop_details ?? null,
      model: response.model,
      usage: response.usage,
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: "The model is rate limited right now. Try again shortly." }, 429);
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return json({ error: "The server's API key was rejected." }, 500);
    }
    if (error instanceof Anthropic.BadRequestError) {
      return json({ error: `The model rejected the request: ${error.message}` }, 400);
    }
    if (error instanceof Anthropic.APIError) {
      return json({ error: `The model returned an error (${error.status ?? "no status"}).` }, 502);
    }
    return json({ error: "The live agent failed unexpectedly." }, 500);
  }
}
