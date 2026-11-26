import assert from "node:assert/strict";
import { test } from "node:test";

import { mcpArgs } from "./mcp.js";
import { collectVersions } from "./versions.js";

const browser = { version: () => "test" };

test("the recorded MCP arguments carry the origin allowlist the session was launched with", () => {
  const origin = "http://localhost:5183/bench/voucher";
  const versions = collectVersions(browser, { headed: false, origin });
  assert.deepEqual(versions.playwrightMcpArgs, mcpArgs({ headed: false, origin }));
  const at = versions.playwrightMcpArgs.indexOf("--allowed-origins");
  assert.ok(at >= 0, "--allowed-origins is recorded");
  assert.equal(versions.playwrightMcpArgs[at + 1], "http://localhost:5183");
});

test("without an origin no allowlist is recorded", () => {
  const versions = collectVersions(browser, { headed: true });
  assert.ok(!versions.playwrightMcpArgs.includes("--allowed-origins"));
});
