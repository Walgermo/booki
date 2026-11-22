import { apply, type Write } from "./books";
import { actorFor } from "./people";
import { books } from "./store";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/**
 * The write API. Who is calling comes from the bearer token (`person:kari`,
 * `agent:nina` for the agent working for Nina), never from the body.
 * Web-standard Request and Response, so a test can call it directly.
 */
export async function handleBooks(request: Request): Promise<Response> {
  if (request.method === "GET") return json(200, { ok: true, books: books() });
  if (request.method !== "POST") return json(405, { ok: false, message: "Bruk GET eller POST." });
  const actor = actorFor(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null);
  let write: Write;
  try {
    write = (await request.json()) as Write;
  } catch {
    return json(400, { ok: false, message: "Kroppen er ikke JSON." });
  }
  const answer = apply(books(), actor, write);
  return json(answer.ok ? 200 : answer.status, answer);
}
