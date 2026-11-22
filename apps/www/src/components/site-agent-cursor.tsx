import { AgentCursor, type AgentCursorState } from "@booki/react";

import { useAgentCursor } from "@/agent";
import { useLang } from "@/lib/lang";

/** What the agent is doing, said the way a Norwegian accountant would say it. */
const VERBS_NB: [RegExp, string][] = [
  [/^setMinor$/, "setter beløp"],
  [/^addLine$/, "legger til linje"],
  [/^setLines?$/, "fører linjer"],
  [/^removeLine$/, "fjerner linje"],
  [/^clear$/, "tømmer"],
  [/^press$/, "trykker"],
  [/^setAccount$/, "velger konto"],
  [/^setTaxCode$/, "velger mva-kode"],
  [/^set(Date|Period)$/, "setter dato"],
  [/^setValue$/, "velger"],
  [/^setSearch$/, "søker"],
  [/^setSort$/, "sorterer"],
  [/^setFilter$/, "filtrerer"],
  [/^setPage$/, "blar"],
  [/^completeTask$/, "fullfører oppgave"],
  [/^(suggestMatch|setMatches)/, "foreslår avstemming"],
  [/^proposeRejection$/, "foreslår avvisning"],
  [/^approveUnderRule$/, "godkjenner etter regel"],
  [/^correctField$/, "retter felt"],
  [/^confirmField$/, "bekrefter felt"],
  [/^proposeCoding$/, "foreslår kontering"],
  [/^(openAccount|showVoucher|open)/, "åpner"],
  [/^back$/, "går tilbake"],
  [/^close$/, "lukker"],
  [/^drill$/, "går inn i"],
  [/^setLimit$/, "viser de største"],
  [/^setRange$/, "velger periode"],
  [/^overdue$/, "finner forfalte"],
  [/^draft/, "skriver utkast"],
  [/^drawSample$/, "trekker utvalg"],
  [/^setResult$/, "fører resultat"],
  [/^setTickMark$/, "krysser av"],
  [/^setCurrency$/, "velger valuta"],
  [/^setStatus$/, "setter status"],
  [/^setOpen$/, "åpner"],
  [/^propose/, "foreslår"],
  [/^correct/, "retter"],
  [/^confirm/, "bekrefter"],
  [/^edit/, "endrer"],
  [/^complete/, "fullfører"],
  [/^explain/, "forklarer"],
  [/^(assert|check|validate|verify)/, "sjekker"],
  [/^link/, "knytter"],
  [/^classify/, "klassifiserer"],
  [/^remove/, "fjerner"],
  [/^add/, "legger til"],
  [/^set/, "setter"],
];

function narrateNb(state: AgentCursorState): string {
  const step = state.step;
  if (!step) return state.action;
  const verb = VERBS_NB.find(([pattern]) => pattern.test(step.action))?.[1] ?? state.action;
  const first = step.args[0];
  const arg = typeof first === "string" || typeof first === "number" ? ` ${String(first).slice(0, 24)}` : "";
  return `${verb}${arg}`;
}

/** The agent's pointer for this page: on while the page is open, off on the benchmark pages. */
export function SiteAgentCursor() {
  const cursor = useAgentCursor();
  const { lang } = useLang();
  return <AgentCursor cursor={cursor} label="Agent" narrate={lang === "nb" ? narrateNb : true} />;
}
