import { RULES, type RuleId } from "./rules.js";

type Scored = { rule: RuleId; count?: number };

/**
 * 100 minus each rule's points per finding, capped per rule, never below 0.
 * The caps keep one kind of problem from hiding the others: a page with
 * forty unnamed fields and nothing else wrong still scores 70.
 */
export function score(findings: Scored[]): {
  score: number;
  grade: "ready" | "partly ready" | "not ready";
  deductions: Array<{ rule: RuleId; findings: number; points: number }>;
} {
  const counts = new Map<RuleId, number>();
  for (const finding of findings) {
    // A grouped finding (fields sharing a name) counts once; snapshot size carries its own weight.
    const weight = finding.rule === "snapshot-size" ? (finding.count ?? 1) : 1;
    counts.set(finding.rule, (counts.get(finding.rule) ?? 0) + weight);
  }
  const deductions = [...counts.entries()]
    .map(([rule, n]) => ({ rule, findings: n, points: Math.min(RULES[rule].cap, RULES[rule].points * n) }))
    .sort((a, b) => b.points - a.points);
  const total = Math.max(0, 100 - deductions.reduce((sum, d) => sum + d.points, 0));
  return { score: total, grade: total >= 85 ? "ready" : total >= 60 ? "partly ready" : "not ready", deductions };
}
