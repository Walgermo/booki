/**
 * The in-process conformance suite for the Agent Contract (spec/agent-contract.md,
 * section 10). It drives an agent bridge directly, without a browser, so it can
 * ACT: a check calls act(). The browser audit (audit.ts) never clicks.
 *
 * Acts on the bridge: run it against test data, never a live company.
 */
import type { AgentBridge, ActStep, BridgeEvent, ServerActor, ServerAnswer } from "./types.js";
import { CONFORMANCE_CHECKS, type CheckOutcome } from "./checks.js";

export type ConformanceTarget = {
  bridge: AgentBridge;
  /** One safe, successful agent step to drive for the recording check. */
  drive?: ActStep;
  /** Literal secret values (e.g. a test IBAN) that must never appear in the snapshot. */
  secrets?: string[];
  /** A closed-list probe: a bad value and every valid choice the refusal must name. */
  closedList?: { step: ActStep; valid: string[] };
  /** Person-only steps the agent must be refused (e.g. approve). */
  personOnly?: ActStep[];
  /** Your server's write gate; asked for every permission in section 5.1 as an agent. */
  server?: (actor: ServerActor | null, permission: string) => ServerAnswer | Promise<ServerAnswer>;
  /**
   * The id and roles of an actor your server would otherwise let do `permission`. The
   * person-only check asks as an agent with them (refused) and as a person with them (let
   * through). Default: roles `[permission]`.
   */
  serverActor?: (permission: string) => { id: string; roles: string[] };
  /** Map your bridge's event to {source, actor}; default is identity. */
  normalizeEvent?: (raw: unknown) => BridgeEvent;
};

export type CheckResult = {
  id: string;
  section: string;
  level: "MUST" | "SHOULD";
  status: "pass" | "fail" | "skip";
  message: string;
};

export type ConformanceReport = {
  contract: "0.1";
  checks: CheckResult[];
  passed: number;
  failed: number;
  skipped: number;
  conforms: boolean;
};

export async function runConformance(target: ConformanceTarget): Promise<ConformanceReport> {
  const checks: CheckResult[] = [];
  for (const check of CONFORMANCE_CHECKS) {
    let outcome: CheckOutcome;
    try {
      outcome = await check.run(target);
    } catch (error) {
      outcome = { status: "fail", message: error instanceof Error ? error.message : String(error) };
    }
    checks.push({
      id: check.id,
      section: check.section,
      level: check.level,
      status: outcome.status,
      message: outcome.message,
    });
  }

  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const skipped = checks.filter((c) => c.status === "skip").length;
  const conforms = !checks.some((c) => c.level === "MUST" && c.status === "fail");
  return { contract: "0.1", checks, passed, failed, skipped, conforms };
}

export function formatConformance(report: ConformanceReport): string {
  const lines = report.checks.map((c) => `${c.status.toUpperCase()}  §${c.section}  ${c.id}  ${c.message}`);
  const verdict = report.conforms ? "Conforms" : "Does not conform";
  lines.push(
    `${verdict} to the Agent Contract ${report.contract}: ${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped.`,
  );
  return lines.join("\n");
}
