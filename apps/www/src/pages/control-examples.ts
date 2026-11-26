import { formatMoney, money } from "@booki-aui/core/money";

import { AGENT_DEMOS, type DemoContext, type Said } from "./agent-demos";

export type ControlExample = {
  code: string;
  result: Said;
  language: "javascript" | "jsx";
};

const note = (en: string, nb: string): Said => ({ en, nb });
const jsx = (code: string, en: string, nb: string): ControlExample => ({ code, result: note(en, nb), language: "jsx" });

const usage: Record<string, ControlExample> = {
  money: {
    language: "javascript",
    code: `import {
  addMoney, formatMoney, minorFromDecimal, money,
} from "@booki-aui/core/money"

const net = money(minorFromDecimal("125.00", "USD"), "USD")
const tax = money(1000, "USD")
const total = addMoney(net, tax)

console.log(total) // { minor: 13500, currency: "USD" }
console.log(formatMoney(total, { locale: "en-US" })) // $135.00`,
    result: note(
      "Keep 13500 cents in storage and format $135.00 for display. addMoney requires matching currencies.",
      "Lagre 13500 cent og formater $135.00 for visning. addMoney krever at beløpene har samme valuta.",
    ),
  },
  "money-amount": jsx(
    `import { money } from "@booki-aui/core/money"
import { MoneyAmount } from "@booki-aui/react"

<MoneyAmount value={money(12500, "NOK")} />`,
    "Displays 125.00 NOK using the provider's locale. Use the Money value (12500 øre) in calculations.",
    "Viser 125,00 NOK med språkinnstillingene fra provideren. Bruk Money-verdien (12500 øre) i beregninger.",
  ),
  "voucher-lines": jsx(
    `import { VoucherLines } from "@booki-aui/react"

<VoucherLines lines={[
  { id: "1", account: "1500", debitMinor: 12500, creditMinor: 0 },
  { id: "2", account: "3000", debitMinor: 0, creditMinor: 12500 },
]} />`,
    "The footer shows equal totals of 12500 minor units each. Use VoucherComposer if an agent needs to edit the voucher.",
    "Bunnlinjen viser like summer på 12500 i minste valutaenhet. Bruk VoucherComposer hvis agenten skal redigere bilaget.",
  ),
  "audit-trail": jsx(
    `import { AuditTrail } from "@booki-aui/react"

<AuditTrail events={[{
  id: "1",
  at: "2026-11-20T09:12:00Z",
  actor: "agent:bookkeeper",
  action: "update",
  target: "Draft 1042",
}]} />`,
    "The trail shows who changed draft 1042 and when. Pass your stored events to AuditTrail; attachAudit subscribes to bridge changes.",
    "Sporet viser hvem som endret utkast 1042, og når. Send de lagrede hendelsene til AuditTrail. attachAudit abonnerer på endringer fra broen.",
  ),
  toasts: jsx(
    `import { BookiToasts, useAgentToasts } from "@booki-aui/react"
import { agent } from "./agent"

export function AgentReceipts() {
  useAgentToasts(agent)
  return <BookiToasts />
}`,
    "Mount AgentReceipts once in the app shell. A bridge edit shows an agent-marked receipt, with Undo for eligible changes.",
    "Monter AgentReceipts én gang i applikasjonen. En endring via broen viser en agentmerket kvittering, med Angre der det er mulig.",
  ),
  "country-toggle": jsx(
    `import { BookiLocaleProvider, CountryToggle } from "@booki-aui/react"

<BookiLocaleProvider defaultCountry="NO">
  <CountryToggle />
</BookiLocaleProvider>`,
    "Switching to US changes the active profile for other Booki controls under the provider. This is a person's setting.",
    "Bytter personen til US, endres den aktive profilen for andre Booki-kontroller under provideren.",
  ),
};

const results: Record<string, Said> = {
  "amount-field": note(
    "The next snapshot shows minor = 1550000 (15,500.00 in NOK or USD).",
    "Neste øyeblikksbilde viser minor = 1550000 (15 500,00 i NOK eller USD).",
  ),
  "amount-input": note(
    "The next snapshot shows minor = 4800000 (48,000.00 in NOK or USD).",
    "Neste øyeblikksbilde viser minor = 4800000 (48 000,00 i NOK eller USD).",
  ),
  "currency-select": note(
    "The selected ISO 4217 code changes to the code supplied.",
    "Den valgte ISO 4217-koden endres til koden i kallet.",
  ),
  "organization-number-input": note(
    "The snapshot reports isValid = true for the example identifier.",
    "Øyeblikksbildet viser isValid = true for eksempelnummeret.",
  ),
  "accounting-period-select": note(
    "The selected value becomes the second-to-last ID in the advertised options.",
    "Den valgte verdien blir ID-en til det nest siste alternativet.",
  ),
  "financial-date-field": note(
    "The snapshot shows the invoice date as 2026-11-30 in ISO YYYY-MM-DD format.",
    "Øyeblikksbildet viser fakturadato 2026-11-30 i ISO-formatet YYYY-MM-DD.",
  ),
  "invoice-number-input": note(
    'The next snapshot shows value = "10044". The number is a string.',
    'Neste øyeblikksbilde viser value = "10044". Nummeret er en tekststreng.',
  ),
  "attestation-status": note(
    'The preview starts with value = "pending". The person uses the attestation controls to decide.',
    'Forhåndsvisningen starter med value = "pending". Personen tar beslutningen i attesteringskontrollen.',
  ),
  "approval-chain": note(
    "The demo reports pending at the Manager level. Kari and Per may decide.",
    "Demoen viser status pending på Manager-nivået. Kari og Per kan godkjenne.",
  ),
  "voucher-composer": note(
    "Line 2 changes to 1050000 minor units (10,500.00). The draft is now 50000 minor units out of balance.",
    "Linje 2 endres til 1050000 i minste valutaenhet (10 500,00). Utkastet har nå en differanse på 50000 i minste valutaenhet.",
  ),
  "payment-batch": note(
    "The duplicate payment p3 disappears from the draft. Releasing the batch still requires a person.",
    "Den doble betalingen p3 forsvinner fra utkastet. Frigivelse av batchen krever fortsatt en person.",
  ),
  "invoice-editor": note(
    "The draft gains a line for two units at 145000 minor units each. Its gross is 362500 minor units including 25% tax.",
    "Utkastet får en linje med to enheter til 145000 i minste valutaenhet per enhet. Bruttobeløpet for linjen er 362500 inkludert 25 % avgift.",
  ),
  "expense-claim": note(
    "The claim gains a 102 km mileage line. The policy supplies the rate and the claim computes the new total in minor units.",
    "Kravet får en kjørelengdelinje på 102 km. Reglene gir satsen, og kravet beregner ny sum i minste valutaenhet.",
  ),
  "ledger-table": note(
    "The ledger opens the entries for account 1500. The next snapshot includes the account's rows.",
    "Kontoboken viser posteringene på konto 1500. Neste øyeblikksbilde inkluderer radene for kontoen.",
  ),
  "audit-workpaper": note(
    "Records an OK test result on the first sampled item under the agent's identity.",
    "Registrerer godkjent testresultat på den første posten i utvalget med agenten som aktør.",
  ),
  "sheet-stack": note(
    "Closes sheets above 05.3.2 and makes that sheet the top one.",
    "Lukker arkene over 05.3.2 og gjør det arket til det øverste.",
  ),
  "kpi-stat": note(
    "October is 48650000 minor units (486,500.00), up 7.6% from 45200000 minor units in September. favourable is true.",
    "Oktober viser 48650000 i minste valutaenhet (486 500,00), opp 7,6 % fra 45200000 i september. favourable er true.",
  ),
  "trend-chart": note(
    "The chart switches to a six-month window. Each point remains an amount in minor units.",
    "Diagrammet bytter til en periode på seks måneder. Hvert punkt er fortsatt et beløp i minste valutaenhet.",
  ),
  "bar-chart": note(
    "Shows three accounts separately and adds the rest to Other. Bar amounts are in minor units.",
    "Viser tre kontoer separat og summerer resten under Annet. Beløpene i stolpene er i minste valutaenhet.",
  ),
  "account-picker": note(
    "The selected value becomes the expense account number supplied. The snapshot also shows the account name.",
    "Den valgte verdien blir utgiftskontoen i kallet. Øyeblikksbildet viser også kontonavnet.",
  ),
  "tax-code-select": note(
    "The picker applies the first listed code. The snapshot reports its rate in percent.",
    "Velgeren bruker den første koden i listen. Øyeblikksbildet viser satsen i prosent.",
  ),
  "payment-confirm": note(
    "The bridge refuses to type the confirmation word. Payment confirmation requires the person.",
    "Broen avviser å skrive bekreftelsesordet. Betalingen må bekreftes av en person.",
  ),
  "exception-banner": note(
    "The bridge refuses to press Review. The person reviews the exception.",
    "Broen avviser trykk på Se gjennom. Personen gjennomgår avviket.",
  ),
  "sca-prompt": note(
    "The bridge refuses to start the mock authentication. The person starts it.",
    "Broen avviser å starte den simulerte autentiseringen. Personen starter den.",
  ),
};

const dynamicArgs: Record<string, string> = {
  "accounting-period-select": "[entry.items.at(-2).value]",
  "audit-workpaper": '[entry.workpaper.items[0].id, "ok"]',
  "tax-code-select": "[entry.items[0].value]",
};

const reads: Record<string, string> = {
  "approval-chain": "status, currentLevel, mayDecide",
  "attestation-status": "value",
  "kpi-stat": "valueMinor, previousMinor, deltaPct, favourable",
};

// The step to show when it is not the first act: the demo enters an invalid number first, then corrects it.
const exampleAct: Record<string, number> = {
  "organization-number-input": 1,
};

const confirmation: Record<string, string> = {
  "payment-confirm": "Confirm this payment with a person",
  "exception-banner": "Exception review needs a person",
  "sca-prompt": "SCA requires a person",
};

/** Build the console example from the same steps used in the live preview. */
export function controlExample(name: string, context: Omit<DemoContext, "fmt">): ControlExample {
  if (usage[name]) return usage[name];
  const steps = AGENT_DEMOS[name]?.({
    ...context,
    fmt: (minor) => formatMoney(money(minor, context.profile.currency), { locale: context.profile.locale }),
  });
  const step = reads[name]
    ? steps?.find((step) => step.kind === "read")
    : exampleAct[name] !== undefined
      ? steps?.filter((step) => step.kind === "act")[exampleAct[name]]
      : (steps?.find((step) => step.kind === "act" && !step.expectRefusal) ??
        steps?.find((step) => step.kind === "act"));
  if (!step?.on) throw new Error(`Missing docs example for ${name}`);

  const confirm = confirmation[name];
  let code = `const { agent } = window
const entry = agent.snapshot().filter(
  (entry) => !entry.offPage && entry.component === ${JSON.stringify(step.on)}${confirm ? ` &&\n    entry.confirm === ${JSON.stringify(confirm)}` : ""},
)[${step.nth ?? 0}]`;

  const result = results[name] ?? (step.kind === "act" && typeof step.done !== "function" ? step.done : undefined);
  if (!result) throw new Error(`Missing docs outcome for ${name}`);
  if (step.kind === "read") {
    const keys = reads[name];
    code += `\nconst { ${keys} } = entry\nconsole.log({ ${keys} })`;
  } else {
    const args = typeof step.args === "function" ? dynamicArgs[name] : JSON.stringify(step.args ?? []);
    if (!args) throw new Error(`Missing docs arguments for ${name}`);
    code += `\nconst result = await agent.act({
  steps: [{
    ref: entry.ref,
    action: ${JSON.stringify(step.action)},
    args: ${args},
  }],
})
console.log(result.ok) // ${!step.expectRefusal}`;
  }

  return { code, language: "javascript", result };
}

export function usesBridge(name: string): boolean {
  return !usage[name];
}
