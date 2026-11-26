import { formatMoney } from "@booki-aui/core/money";
import type { AgentCursorState } from "@booki-aui/primitives/agent-cursor";

/** What the agent is doing, said the way a Norwegian accountant would say it. First match wins. */
const VERBS_NB: [RegExp, string][] = [
  [/^setMinor$/, "setter beløp"],
  [/^addLine$/, "legger til linje"],
  [/^setLines?$/, "fører linjer"],
  [/^removeLine$/, "fjerner linje"],
  [/^clear$/, "tømmer"],
  [/^press$/, "trykker"],
  [/^setAccount$/, "velger konto"],
  [/^setTaxCode$/, "velger mva-kode"],
  [/^setCode$/, "velger"],
  [/^set(Date|Period)$/, "setter dato"],
  [/^setForeign$/, "fører valuta"],
  [/^setValue$/, "skriver"],
  [/^setText$/, "skriver"],
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

/**
 * The agent cursor's label in Norwegian: a verb for the action and its first
 * plain argument. An amount (`setMinor`) is shown as a person writes it, in the
 * field's own currency, "setter beløp 1 250,00" (or "125 000" for yen), not in
 * minor units; when the field's currency is not known, the minor units as given. `AgentCursor` uses it by itself under a Norwegian profile;
 * pass it as `narrate` to choose it yourself.
 */
export function narrateNorwegian(state: AgentCursorState): string {
  const step = state.step;
  if (!step) return state.action;
  const verb = VERBS_NB.find(([pattern]) => pattern.test(step.action))?.[1];
  if (!verb) return state.action;
  const first = step.args[0];
  if (step.action === "setMinor" && typeof first === "number" && Number.isSafeInteger(first) && step.currency) {
    return `${verb} ${formatMoney(first, { currency: step.currency, locale: "nb-NO", withCurrency: false })}`;
  }
  const arg = typeof first === "string" || typeof first === "number" ? ` ${String(first).slice(0, 24)}` : "";
  return `${verb}${arg}`;
}
