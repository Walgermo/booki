import { apply, type Write } from "./crm";
import { actorFor } from "./people";
import { crm } from "./store";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

/**
 * The write API. Who is calling comes from the bearer token (`person:kari`, or
 * `agent:kari` for the agent working for Kari), never from the body.
 * Web-standard Request and Response, so a test can call it directly.
 */
export async function handleCrm(request: Request): Promise<Response> {
  if (request.method === "GET") return json(200, { ok: true, crm: crm() });
  if (request.method !== "POST") return json(405, { ok: false, message: "Bruk GET eller POST." });
  const actor = actorFor(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null);
  let write: Write;
  try {
    write = (await request.json()) as Write;
  } catch {
    return json(400, { ok: false, message: "Kroppen er ikke JSON." });
  }
  const answer = apply(crm(), actor, write);
  return json(answer.ok ? 200 : answer.status, answer);
}
