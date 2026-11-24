"use client";

import { formatMoney } from "@booki/core/money";
import { actAndRecord, type AgentBridge } from "@booki/react";
import { STAGES, TODAY } from "./data";
import { AGENT_ID } from "./people";
import { logDecision } from "./agent";
import { settled, takeRefusals } from "./writes";

/**
 * Common sales tasks, done by a scripted agent through the same bridge a model
 * uses: read the page with `snapshot`, change it with `act`. No key needed and
 * the same every time, so each task can be shown and tested. Each one reports
 * what it did and what waits for a person.
 */
export type Report = { did: string[]; waiting: string[] };

export type TaskId = "log-call" | "after-meeting" | "tidy-pipeline" | "quarter" | "close-won";

export const TASKS: { id: TaskId; title: string; ask: string }[] = [
  {
    id: "log-call",
    title: "Logg samtalen og planlegg oppfølging",
    ask: "Jeg ringte kunden nå. Logg samtalen og sett opp oppfølging om tre dager.",
  },
  {
    id: "after-meeting",
    title: "Oppdater avtalen etter møtet",
    ask: "Møtet gikk bra: estimat 210 000 kr, neste fase, lukking om en måned.",
  },
  {
    id: "tidy-pipeline",
    title: "Rydd i salgsløpet",
    ask: "Hva bør vi se på i salgsløpet, og flytt lukkedatoer som har passert.",
  },
  { id: "quarter", title: "Hva sier prognosen?", ask: "Hvordan ser kvartalet ut, og hvor faller vi fra?" },
  { id: "close-won", title: "Marker avtalen som vunnet", ask: "Kunden har signert. Marker avtalen som vunnet." },
];

type Entry = { ref: string; component: string; label?: string } & Record<string, unknown>;
type Step = { ref: string; action: string; args?: unknown[] };
type ActResult = { ok: boolean; error?: { step: number; message: string } };
type DealView = { id: string; name: string; stageId: string; expectedClose?: string; valueMinor: number | null };

const entry = (agent: AgentBridge, component: string) =>
  (agent.snapshot() as unknown as Entry[]).find((item) => item.component === component);

const kr = (minor: number, currency = "NOK") =>
  formatMoney({ minor, currency }, { locale: "nb-NO", trimZeroFraction: true });

const plusDays = (days: number) => {
  const date = new Date(`${TODAY}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Runs steps one at a time, so one refusal does not stop the rest, and waits for the server's answer to each. */
async function each(agent: AgentBridge, steps: { step: Step; done: string }[], report: Report) {
  for (const { step, done } of steps) {
    takeRefusals();
    const result = (await actAndRecord(agent, { steps: [step] } as never, {
      audit: logDecision,
      agentId: AGENT_ID,
    })) as ActResult;
    await settled();
    const [refused] = takeRefusals();
    const what = done.split(":")[0];
    if (!result.ok) report.waiting.push(`${what}: ${result.error?.message ?? "avvist"}`);
    else if (refused) report.waiting.push(`${what}: serveren sa nei: ${refused}`);
    else report.did.push(done);
  }
}

/** Log the call that just happened and schedule the follow-up, on the deal open in the panel. */
async function logCall(agent: AgentBridge, me: string): Promise<Report> {
  const report: Report = { did: [], waiting: [] };
  const timeline = entry(agent, "activity-timeline");
  if (!timeline) return { did: [], waiting: ["Åpne en avtale først."] };
  await each(
    agent,
    [
      {
        step: {
          ref: timeline.ref,
          action: "logActivity",
          args: [
            {
              kind: "call",
              subject: "Ringte om tilbudet",
              body: "Kunden ønsker oppstart i januar.",
              evidence: "Samtalelogg",
            },
          ],
        },
        done: "samtale: logget",
      },
      {
        step: {
          ref: timeline.ref,
          action: "scheduleTask",
          args: [{ subject: "Send revidert tilbud", dueDate: plusDays(3), assigneeId: me }],
        },
        done: `oppfølging: planlagt ${plusDays(3)}`,
      },
    ],
    report,
  );
  return report;
}

/** After a good meeting: an estimate with its source, the next stage, a close date. */
async function afterMeeting(agent: AgentBridge, dealId: string): Promise<Report> {
  const report: Report = { did: [], waiting: [] };
  const board = entry(agent, "deal-pipeline");
  const deal = (board?.deals as DealView[] | undefined)?.find((item) => item.id === dealId);
  if (!board || !deal) return { did: [], waiting: ["Fant ikke avtalen på tavlen."] };
  const open = STAGES.filter((stage) => !stage.outcome);
  const next = open[open.findIndex((stage) => stage.id === deal.stageId) + 1];
  const steps: { step: Step; done: string }[] = [
    {
      step: {
        ref: board.ref,
        action: "setValue",
        args: [
          dealId,
          { valueMinor: 210_000_00, currency: "NOK", valueStatus: "estimate", valueSource: `Møte ${TODAY}` },
        ],
      },
      done: `${deal.name}: estimat ${kr(210_000_00)} med kilde`,
    },
  ];
  if (next)
    steps.push({
      step: { ref: board.ref, action: "moveDeal", args: [dealId, next.id] },
      done: `${deal.name}: flyttet til ${next.name}`,
    });
  else report.waiting.push(`${deal.name}: siste åpne fase; å lukke avtalen er en persons`);
  steps.push({
    step: { ref: board.ref, action: "setExpectedClose", args: [dealId, plusDays(30)] },
    done: `${deal.name}: forventet lukket ${plusDays(30)}`,
  });
  await each(agent, steps, report);
  return report;
}

/** Read what the board warns about, move close dates that have passed, and say what needs a person. */
async function tidyPipeline(agent: AgentBridge): Promise<Report> {
  const report: Report = { did: [], waiting: [] };
  const board = entry(agent, "deal-pipeline");
  if (!board) return report;
  const deals = board.deals as DealView[];
  const issues = board.issues as Record<string, string[]>;
  const steps: { step: Step; done: string }[] = [];
  for (const deal of deals) {
    for (const issue of issues[deal.id] ?? []) {
      if (/expected to close/.test(issue)) {
        steps.push({
          step: { ref: board.ref, action: "setExpectedClose", args: [deal.id, plusDays(14)] },
          done: `${deal.name}: lukkedatoen hadde passert, flyttet til ${plusDays(14)}`,
        });
      } else if (/nobody vouched for/.test(issue)) {
        report.waiting.push(`${deal.name}: beløpet mangler kilde, så det telles ikke; en person bekrefter det`);
      } else if (/no value/.test(issue)) {
        report.waiting.push(`${deal.name}: har ingen verdi`);
      } else if (/not changed stage/.test(issue)) {
        report.waiting.push(`${deal.name}: har stått lenge i samme fase`);
      }
    }
  }
  await each(agent, steps, report);
  if (report.did.length === 0 && report.waiting.length === 0) report.did.push("salgsløpet: ingenting å rydde");
  return report;
}

/** Read the forecast by quarter, the funnel's biggest drop and the slowest stage. */
async function quarter(agent: AgentBridge): Promise<Report> {
  const report: Report = { did: [], waiting: [] };
  const forecast = entry(agent, "forecast-chart");
  if (forecast) {
    await each(
      agent,
      [
        {
          step: { ref: forecast.ref, action: "setGrouping", args: ["quarter"] },
          done: "prognose: gruppert per kvartal",
        },
      ],
      report,
    );
    const after = entry(agent, "forecast-chart")!;
    const periods = after.periods as {
      period: string;
      wonMinor: number;
      committedMinor: number;
      bestCaseMinor: number;
      weightedMinor: number;
    }[];
    const current = periods.find((row) => row.period === "2026-Q4");
    if (current) {
      report.did.push(
        `2026-Q4: vunnet ${kr(current.wonMinor)}, sikker ${kr(current.committedMinor)}, beste fall ${kr(current.bestCaseMinor)}, vektet ${kr(current.weightedMinor)}`,
      );
    }
    for (const [key, text] of [
      ["unverified", "uten beløp eller kilde, holdt utenfor"],
      ["undated", "uten forventet lukkedato, holdt utenfor"],
      ["otherCurrency", "i annen valuta, holdt utenfor"],
    ] as const) {
      const ids = after[key] as string[];
      if (ids.length) report.waiting.push(`prognose: ${ids.length} ${ids.length === 1 ? "avtale" : "avtaler"} ${text}`);
    }
  }
  const funnel = entry(agent, "funnel-chart");
  if (funnel?.biggestDropId) {
    const steps = funnel.steps as { id: string; label: string; stepConversionPct: number | null }[];
    const drop = steps.find((step) => step.id === funnel.biggestDropId)!;
    await each(
      agent,
      [
        {
          step: { ref: funnel.ref, action: "drill", args: [drop.id] },
          done: `konvertering: størst frafall før ${drop.label} (${drop.stepConversionPct} % går videre)`,
        },
      ],
      report,
    );
  }
  const stages = entry(agent, "stage-duration");
  if (stages?.slowestId) {
    const rows = stages.rows as { stageId: string; name: string; medianDays: number | null; overTarget: string[] }[];
    const slow = rows.find((row) => row.stageId === stages.slowestId)!;
    report.did.push(`tid i fase: tregest er ${slow.name}, median ${slow.medianDays} dager`);
    const over = rows.flatMap((row) => row.overTarget);
    if (over.length) report.waiting.push(`tid i fase: ${over.join(", ")} er over målet`);
  }
  return report;
}

/** Try to mark the deal won. Closing a deal is a person's decision: Booki refuses it and says so. */
async function closeWon(agent: AgentBridge, dealId: string): Promise<Report> {
  const report: Report = { did: [], waiting: [] };
  const board = entry(agent, "deal-pipeline");
  if (!board) return report;
  await each(
    agent,
    [{ step: { ref: board.ref, action: "moveDeal", args: [dealId, "won"] }, done: `${dealId}: markert som vunnet` }],
    report,
  );
  report.waiting.push(`${dealId}: trykk «Marker vunnet» selv når kunden har signert`);
  return report;
}

export async function runTask(
  agent: AgentBridge,
  task: TaskId,
  context: { dealId: string; me: string },
): Promise<Report> {
  if (task === "log-call") return logCall(agent, context.me);
  if (task === "after-meeting") return afterMeeting(agent, context.dealId);
  if (task === "tidy-pipeline") return tidyPipeline(agent);
  if (task === "quarter") return quarter(agent);
  return closeWon(agent, context.dealId);
}
