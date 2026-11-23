/**
 * A short-lived credential of the agent's own, so the server can tell the
 * agent from the person it works for. Your sign-in issues it for a signed-in
 * person; the page sends it with the agent's writes; the server verifies it
 * and adds the agent's roles. Signed with HMAC-SHA-256 through WebCrypto, so
 * it runs in Node, edge runtimes, Deno and Bun.
 *
 * It is not a session: keep the person's own sign-in for their writes.
 */

export type AgentGrant = {
  /** The agent's id, as `actorLabel` writes it after `agent:`. */
  agentId: string;
  /** The person whose session the agent works in. */
  onBehalfOf: string;
  /** The client it came through (your page, an MCP client). */
  clientId?: string;
  /**
   * What the token is for: an engagement, a company, one API. `verifyAgentToken`
   * with `{ audience }` refuses a token issued for anything else.
   */
  audience?: string;
  /** Seconds it is valid. Default 900 (15 minutes), at most 86 400. */
  ttlSeconds?: number;
};

/** What a valid token says: add `roles` from your own records to make a `ServerActor`. */
export type AgentClaims = {
  id: string;
  kind: "agent";
  onBehalfOf: string;
  clientId?: string;
  audience?: string;
  /** This token's own id, for the audit trail (`actorRecord`). */
  grantId: string;
  /** When it stops being valid, in milliseconds since 1970. */
  expiresAt: number;
};

import { BookiError } from "./msg.js";

const PREFIX = "bk1";
const encoder = new TextEncoder();

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromBase64url = (text: string) => {
  const plain = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(plain, (char) => char.charCodeAt(0));
};

async function keyFor(secret: string): Promise<CryptoKey> {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new BookiError("agent-token.secret-short");
  }
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Issues a token for an agent working for `onBehalfOf`. Call it only for a person your sign-in established. */
export async function issueAgentToken(grant: AgentGrant, secret: string, now = Date.now()): Promise<string> {
  const ttl = grant.ttlSeconds ?? 900;
  if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 86_400) {
    throw new BookiError("agent-token.ttl", { value: String(ttl) });
  }
  if (!grant.agentId || !grant.onBehalfOf) throw new BookiError("agent-token.grant");
  const claims: AgentClaims = {
    id: grant.agentId,
    kind: "agent",
    onBehalfOf: grant.onBehalfOf,
    ...(grant.clientId ? { clientId: grant.clientId } : {}),
    ...(grant.audience ? { audience: grant.audience } : {}),
    grantId: base64url(crypto.getRandomValues(new Uint8Array(12))),
    expiresAt: now + ttl * 1000,
  };
  const payload = base64url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign("HMAC", await keyFor(secret), encoder.encode(`${PREFIX}.${payload}`));
  return `${PREFIX}.${payload}.${base64url(new Uint8Array(signature))}`;
}

/**
 * The claims of a valid, unexpired token signed with `secret`, or null. Null
 * for every failure alike: a caller learns nothing about why.
 */
export async function verifyAgentToken(
  token: unknown,
  secret: string,
  now: number | { now?: number; audience?: string } = Date.now(),
): Promise<AgentClaims | null> {
  const at = typeof now === "number" ? now : (now.now ?? Date.now());
  const audience = typeof now === "number" ? undefined : now.audience;
  const key = await keyFor(secret);
  if (typeof token !== "string" || token.length > 4096) return null;
  const [prefix, payload, signature, ...rest] = token.split(".");
  if (prefix !== PREFIX || !payload || !signature || rest.length) return null;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64url(signature),
      encoder.encode(`${PREFIX}.${payload}`),
    );
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as AgentClaims;
    if (claims.kind !== "agent" || typeof claims.id !== "string" || typeof claims.onBehalfOf !== "string") return null;
    if (!Number.isFinite(claims.expiresAt) || claims.expiresAt <= at) return null;
    // Given an audience, only a token issued for exactly that one passes.
    if (audience !== undefined && claims.audience !== audience) return null;
    return claims;
  } catch {
    return null;
  }
}
