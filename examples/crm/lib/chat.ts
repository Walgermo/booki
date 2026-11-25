import { anthropic } from "@ai-sdk/anthropic";
import { createMCPTools, MCPClientError } from "@ai-sdk/mcp";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
  streamText,
  toUIMessageStream,
} from "ai";
import { nameOf, PEOPLE } from "./people";

/** The tools the page registers for its assistant: Booki's `registerTools` with the prefix `crm`. */
export const TOOL_NAMES = ["crm_act", "crm_query", "crm_snapshot"] as const;

const MODEL = process.env.CRM_MODEL ?? "claude-sonnet-5-5";

const text = (status: number, body: string) =>
  new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

/**
 * The chat runs only on a local development server: this example has no
 * sign-in in front of the model, and the browser sends the tool definitions.
 * In your app, put your sign-in here instead.
 */
export function isLocalRequest(request: Request): boolean {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL !== undefined) return false;
  const url = new URL(request.url);
  const local = ["localhost", "127.0.0.1", "[::1]"];
  const host = request.headers.get("host");
  const port = url.port ? `:${url.port}` : "";
  // The Host header too, so a page elsewhere cannot reach this through DNS rebinding.
  if (!local.includes(url.hostname) || !local.some((name) => host === `${name}${port}`)) return false;
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (
    request.headers.has("forwarded") ||
    (forwardedHost !== null && forwardedHost !== host) ||
    (forwardedFor !== null && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(forwardedFor))
  )
    return false;
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== `${url.protocol}//${host}`) return false;
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin" || site === "none";
}

const instructions = (me: string) =>
  [
    `You are the assistant in a sales CRM, working for ${nameOf(me)}. Answer in Norwegian Bokmål, briefly.`,
    "The page is yours to operate through three tools: crm_snapshot lists the controls and what each offers,",
    "crm_query reads one control's records (deals, activities, forecast rows), and crm_act runs steps on them.",
    "Read with crm_snapshot before you act, and use the refs and actions it lists; do not guess them.",
    "Change something only when asked. After acting, say in one or two sentences what changed.",
    "Some steps are a person's, whatever you are asked: marking a deal won or lost, reopening it, removing an activity.",
    "When crm_act refuses one, tell the person which button to press; do not try another way round.",
    "A refusal or a step that did not take comes back as a sentence: read it and pass it on, do not retry blindly.",
  ].join(" ");

/**
 * The assistant's server half. The browser sends the conversation and the
 * tools the page registered; the model runs here with the key, and each tool
 * call goes back to the tab, where Booki's bridge runs it under the page's rules.
 */
export async function handleChat(request: Request): Promise<Response> {
  if (!isLocalRequest(request)) return text(403, "Chatten kjører bare på en lokal utviklingsserver.");
  if (!process.env.ANTHROPIC_API_KEY)
    return text(503, "Sett ANTHROPIC_API_KEY i examples/crm/.env.local og start serveren på nytt.");

  let body: { messages?: unknown; tools?: unknown; me?: unknown };
  try {
    body = await request.json();
  } catch {
    return text(400, "Kroppen er ikke JSON.");
  }
  const me = PEOPLE.some((person) => person.id === body.me) ? String(body.me) : "kari";

  // Only the page's own three tools: anything else the browser lists is not this app's.
  const definitions = Array.isArray(body.tools)
    ? body.tools.filter(
        (tool): tool is { name: string } =>
          typeof tool === "object" && tool !== null && TOOL_NAMES.includes((tool as { name: never }).name),
      )
    : [];
  if (definitions.length === 0) return text(400, "Siden har ikke registrert verktøyene sine.");

  let tools: ReturnType<typeof createMCPTools>;
  try {
    tools = createMCPTools(definitions);
  } catch (error) {
    if (!MCPClientError.isInstance(error)) throw error;
    return text(400, "Verktøyene fra siden er ugyldige.");
  }

  const validated = await safeValidateUIMessages({ messages: body.messages, tools });
  // Text from the person, and the assistant's text and tool calls: no files, nothing else.
  if (
    !validated.success ||
    validated.data.some(
      (message) =>
        (message.role !== "user" && message.role !== "assistant") ||
        message.parts.some(
          (part) =>
            part.type !== "text" &&
            (message.role !== "assistant" || (part.type !== "step-start" && part.type !== "dynamic-tool")),
        ),
    )
  )
    return text(400, "Bare tekst og verktøysvar fra siden.");

  const result = streamText({
    model: anthropic(MODEL),
    instructions: instructions(me),
    messages: await convertToModelMessages(validated.data, { tools }),
    tools,
    abortSignal: request.signal,
  });
  return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) });
}
