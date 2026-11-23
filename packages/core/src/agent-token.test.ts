import { describe, expect, it } from "vitest";
import { issueAgentToken, verifyAgentToken } from "./agent-token.js";

const SECRET = "a-test-secret-that-is-long-enough-1234";

describe("agent tokens", () => {
  it("say which agent works for whom, until they expire", async () => {
    const token = await issueAgentToken({ agentId: "bookkeeper", onBehalfOf: "nina", clientId: "page" }, SECRET, 0);
    expect(await verifyAgentToken(token, SECRET, 1000)).toMatchObject({
      id: "bookkeeper",
      kind: "agent",
      onBehalfOf: "nina",
      clientId: "page",
    });
    expect(await verifyAgentToken(token, SECRET, 900_001)).toBeNull();
  });

  it("refuse a changed token, another secret and anything else, all alike", async () => {
    const token = await issueAgentToken({ agentId: "bookkeeper", onBehalfOf: "nina" }, SECRET, 0);
    const [prefix, payload, signature] = token.split(".");
    const forged = btoa(
      JSON.stringify({ id: "bookkeeper", kind: "agent", onBehalfOf: "per", grantId: "x", expiresAt: 9e15 }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    for (const bad of [
      `${prefix}.${forged}.${signature}`,
      `${prefix}.${payload}.${signature}x`,
      `bk2.${payload}.${signature}`,
      `${token}.extra`,
      "",
      null,
      "x".repeat(5000),
    ]) {
      expect(await verifyAgentToken(bad, SECRET, 1)).toBeNull();
    }
    expect(await verifyAgentToken(token, `${SECRET}-other`, 1)).toBeNull();
  });

  it("give every token its own id, and refuse a short secret or a long life", async () => {
    const a = await verifyAgentToken(await issueAgentToken({ agentId: "b", onBehalfOf: "n" }, SECRET, 0), SECRET, 1);
    const b = await verifyAgentToken(await issueAgentToken({ agentId: "b", onBehalfOf: "n" }, SECRET, 0), SECRET, 1);
    expect(a!.grantId).not.toBe(b!.grantId);
    await expect(issueAgentToken({ agentId: "b", onBehalfOf: "n" }, "short")).rejects.toThrow(/32/);
    await expect(issueAgentToken({ agentId: "b", onBehalfOf: "n", ttlSeconds: 90_000 }, SECRET)).rejects.toThrow();
  });

  it("is only good for the audience it was issued for, when the server asks", async () => {
    const token = await issueAgentToken({ agentId: "b", onBehalfOf: "n", audience: "engagement-93000" }, SECRET, 0);
    expect(await verifyAgentToken(token, SECRET, { now: 1, audience: "engagement-93000" })).toMatchObject({
      audience: "engagement-93000",
    });
    expect(await verifyAgentToken(token, SECRET, { now: 1, audience: "engagement-1" })).toBeNull();
    const none = await issueAgentToken({ agentId: "b", onBehalfOf: "n" }, SECRET, 0);
    expect(await verifyAgentToken(none, SECRET, { now: 1, audience: "engagement-93000" })).toBeNull();
  });
});
