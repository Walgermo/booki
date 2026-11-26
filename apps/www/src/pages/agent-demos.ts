import type { useBookiLocale } from "@booki-aui/react";

import type { Entry } from "@/components/agent-view";

/**
 * "See the agent work": one short script per docs page, keyed by catalogue
 * name. Every step is a real call through the site's agent bridge, on the
 * control in that page's preview, with the control's own agent actions (see
 * packages/react/docs/llms.txt). A refusal is shown where it teaches a rule,
 * and it is the library's own answer, never one written here.
 */

export type Said = { en: string; nb: string };
export type Profile = ReturnType<typeof useBookiLocale>["profile"];
export type DemoContext = {
  country: string;
  profile: Profile;
  /** Minor units in the profile's currency, formatted for the reader. */
  fmt: (minor: number) => string;
};

export type ActStep = {
  kind: "act";
  /** The snapshot `component` to call, inside the preview. */
  on: string;
  /** Which one, when the preview has several of the same kind. */
  nth?: number;
  action: string;
  /** Arguments, or a function of the component's entry just before the call. */
  args?: unknown[] | ((entry: Entry) => unknown[]);
  /** What the step did, read from the entry just after it. Shown when it succeeds. */
  done: Said | ((entry: Entry | undefined) => Said);
  /** The step is expected to be refused: shown as the lesson, not as a failure of the demo. */
  expectRefusal?: boolean;
};

export type ReadStep = {
  kind: "read";
  /** The component to read; omitted reads the whole preview. */
  on?: string;
  nth?: number;
  said: (entry: Entry | undefined, all: Entry[]) => Said;
};

export type DemoStep = ActStep | ReadStep;
export type Demo = (context: DemoContext) => DemoStep[];

const b = (en: string, nb: string): Said => ({ en, nb });

function act(
  on: string,
  action: string,
  args: ActStep["args"],
  done: ActStep["done"],
  more: Partial<Pick<ActStep, "nth" | "expectRefusal">> = {},
): ActStep {
  return { kind: "act", on, action, args, done, ...more };
}

/** A step the agent is not allowed, or not able, to take. The library answers. */
function refused(on: string, action: string, args: ActStep["args"], more: Partial<Pick<ActStep, "nth">> = {}): ActStep {
  return { kind: "act", on, action, args, done: b("Allowed", "Tillatt"), expectRefusal: true, ...more };
}

function read(on: string | undefined, said: ReadStep["said"], nth?: number): ReadStep {
  return { kind: "read", on, said, nth };
}

/** The read-only pages: what the agent finds when it looks, said honestly. */
function readsNothing(what: Said): Demo {
  return () => [
    read(undefined, (_entry, all) =>
      all.length === 0
        ? b(
            `snapshot() lists nothing from this preview. ${what.en}`,
            `snapshot() viser ingenting fra denne forhåndsvisningen. ${what.nb}`,
          )
        : b(`snapshot() lists ${all.length} component(s) here.`, `snapshot() viser ${all.length} komponent(er) her.`),
    ),
  ];
}

const num = (value: unknown) => (typeof value === "number" ? value : 0);
const list = <T = Record<string, unknown>>(value: unknown) => (Array.isArray(value) ? (value as T[]) : []);
const itemValues = (entry: Entry) => list<{ value: string }>(entry.items).map((item) => item.value);

export const AGENT_DEMOS: Record<string, Demo> = {
  money: readsNothing(
    b(
      "Money is data, not a control: the agent reads the integer minor units your app passes, never the formatted text.",
      "Money er data, ikke en kontroll: agenten leser heltall i øre som appen sender, aldri den formaterte teksten.",
    ),
  ),
  "money-amount": readsNothing(
    b(
      "MoneyAmount only displays; the amount an agent works with is the Money value behind it.",
      "MoneyAmount bare viser; beløpet en agent jobber med, er Money-verdien bak.",
    ),
  ),
  "voucher-lines": readsNothing(
    b(
      "VoucherLines is the read-only table for people. For an agent, use VoucherComposer: same lines, with actions and a balance check.",
      "VoucherLines er den skrivebeskyttede tabellen for folk. For en agent bruker dere VoucherComposer: samme linjer, med handlinger og balansesjekk.",
    ),
  ),
  "audit-trail": readsNothing(
    b(
      "The trail is for people. The agent's side of it is written for it: attachAudit records each change it makes, with actor agent:….",
      "Sporet er for folk. Agentens del skrives for den: attachAudit fører hver endring den gjør, med aktør agent:….",
    ),
  ),
  toasts: readsNothing(
    b(
      "Receipts are for the person. useAgentToasts gives one for every change the agent makes, with Undo.",
      "Kvitteringer er for personen. useAgentToasts gir en for hver endring agenten gjør, med Angre.",
    ),
  ),
  "agent-status": readsNothing(
    b(
      "The status line is for the person watching; the agent knows its own state, so it is kept out of the snapshot.",
      "Statuslinjen er for personen som ser på; agenten vet selv hva den gjør, så den holdes utenfor øyeblikksbildet.",
    ),
  ),
  "country-toggle": readsNothing(
    b(
      "The country is the person's setting, so the toggle is not an agent target. The agent sees its effect in every other control: currency, VAT codes, bank format.",
      "Landet er personens innstilling, så bryteren er ikke et mål for agenten. Agenten ser virkningen i alle de andre kontrollene: valuta, mva-koder, bankformat.",
    ),
  ),

  "amount-field": ({ fmt }) => [
    refused("amount-field", "setMinor", ["155.00"]),
    act("amount-field", "setMinor", [1_550_000], (e) =>
      b(
        `Amount set to ${fmt(num(e?.minor))} (1550000 minor units).`,
        `Beløpet er satt til ${fmt(num(e?.minor))} (1550000 øre).`,
      ),
    ),
    read("amount-field", (e) =>
      b(
        `Reads minor = ${num(e?.minor)}, currency ${String(e?.currency)}.`,
        `Leser minor = ${num(e?.minor)}, valuta ${String(e?.currency)}.`,
      ),
    ),
  ],
  "amount-input": ({ fmt }) => [
    act("amount-field", "setMinor", [4_800_000], (e) =>
      b(`Amount set to ${fmt(num(e?.minor))}.`, `Beløpet er satt til ${fmt(num(e?.minor))}.`),
    ),
    act("amount-field", "clear", [], b("Cleared the amount.", "Tømte beløpet.")),
    act("amount-field", "setMinor", [12_500], (e) =>
      b(
        `Amount set to ${fmt(num(e?.minor))}: 12500 is 125.00.`,
        `Beløpet er satt til ${fmt(num(e?.minor))}: 12500 er 125,00.`,
      ),
    ),
  ],
  "currency-select": ({ profile }) => [
    act("currency-select", "setCurrency", [profile.currency === "NOK" ? "USD" : "NOK"], (e) =>
      b(`Currency set to ${String(e?.value)}.`, `Valuta satt til ${String(e?.value)}.`),
    ),
    refused("currency-select", "setCurrency", ["EUR"]),
    act(
      "currency-select",
      "setCurrency",
      [profile.currency],
      b(`Currency set back to ${profile.currency}.`, `Valuta satt tilbake til ${profile.currency}.`),
    ),
  ],
  "bank-account-input": ({ country }) =>
    country === "NO"
      ? [
          act(
            "bank-account",
            "setKontonummer",
            ["12345678903"],
            b("Wrote the account number 1234 56 78903.", "Skrev kontonummeret 1234 56 78903."),
          ),
          read("bank-account", (e) =>
            b(
              `Reads digits = ${String(e?.digits)}: it can write a bank account, never read one back.`,
              `Leser digits = ${String(e?.digits)}: den kan skrive et kontonummer, aldri lese det tilbake.`,
            ),
          ),
        ]
      : [
          act("bank-account", "setRouting", ["011000015"], b("Wrote the routing number.", "Skrev rutingnummeret.")),
          act("bank-account", "setAccount", ["987654321"], b("Wrote the account number.", "Skrev kontonummeret.")),
          read("bank-account", (e) =>
            b(
              `Reads formatted = ${String(e?.formatted)}: it can write a bank account, never read one back.`,
              `Leser formatted = ${String(e?.formatted)}: den kan skrive et kontonummer, aldri lese det tilbake.`,
            ),
          ),
        ],
  "payment-reference-input": ({ country }) => [
    act(
      "payment-reference",
      "setReference",
      [country === "NO" ? "10044048" : "INV-1044"],
      b("Wrote the payment reference.", "Skrev betalingsreferansen."),
    ),
    read("payment-reference", (e) =>
      country === "NO"
        ? b(
            `Reads value = ${String(e?.value)}: a KID is a secret, so the agent writes it blind.`,
            `Leser value = ${String(e?.value)}: en KID er hemmelig, så agenten skriver den i blinde.`,
          )
        : b(
            `Reads value = ${String(e?.value)}: a memo is not a secret, so the agent can read it back.`,
            `Leser value = ${String(e?.value)}: en melding er ikke hemmelig, så agenten kan lese den tilbake.`,
          ),
    ),
  ],
  "organization-number-input": ({ country }) => [
    act("organization-number", "setOrganizationNumber", [country === "NO" ? "812345679" : "12-345678"], (e) =>
      b(
        `Set ${String(e?.formatted)}: isValid = ${String(e?.isValid)}.`,
        `Satte ${String(e?.formatted)}: isValid = ${String(e?.isValid)}.`,
      ),
    ),
    act("organization-number", "setOrganizationNumber", [country === "NO" ? "812345672" : "12-3456789"], (e) =>
      b(
        `Corrected to ${String(e?.formatted)}: isValid = ${String(e?.isValid)}.`,
        `Rettet til ${String(e?.formatted)}: isValid = ${String(e?.isValid)}.`,
      ),
    ),
  ],
  "iban-input": () => [
    act(
      "iban-input",
      "setIban",
      ["NO7112345678903"],
      b("Wrote the IBAN NO71 1234 5678 903.", "Skrev IBAN NO71 1234 5678 903."),
    ),
    read("iban-input", (e) =>
      b(
        `Reads value = ${String(e?.value)}: an IBAN is a secret, so the agent writes it blind.`,
        `Leser value = ${String(e?.value)}: en IBAN er hemmelig, så agenten skriver den i blinde.`,
      ),
    ),
  ],
  "financial-date-field": () => [
    act(
      "financial-date",
      "setDate",
      ["2026-11-30"],
      (e) => b(`Invoice date set to ${String(e?.value)}.`, `Fakturadato satt til ${String(e?.value)}.`),
      { nth: 0 },
    ),
    act(
      "financial-date",
      "setDaysFromToday",
      [30],
      (e) =>
        b(
          `Due date set 30 days out: ${String(e?.value)}, ${num(e?.daysUntilDue)} days until due.`,
          `Forfall satt 30 dager frem: ${String(e?.value)}, ${num(e?.daysUntilDue)} dager til forfall.`,
        ),
      { nth: 1 },
    ),
  ],
  "accounting-period-select": () => [
    act(
      "accounting-period",
      "setPeriod",
      (e) => [itemValues(e).at(-2) ?? ""],
      (e) => b(`Period set to ${String(e?.value)}.`, `Periode satt til ${String(e?.value)}.`),
    ),
    refused("accounting-period", "setPeriod", ["2026-T7"]),
  ],
  "invoice-number-input": () => [
    act("invoice-number", "setInvoiceNumber", ["10044"], (e) =>
      b(`Invoice number set to ${String(e?.value)}.`, `Fakturanummer satt til ${String(e?.value)}.`),
    ),
    read("invoice-number", (e) => b(`Reads value = "${String(e?.value)}".`, `Leser value = «${String(e?.value)}».`)),
  ],
  "attestation-status": () => [
    read("attestation-status", (e) =>
      b(
        `Reads status ${String(e?.value)}, and that approving needs a person.`,
        `Leser status ${String(e?.value)}, og at godkjenning krever en person.`,
      ),
    ),
    refused("attestation-status", "setStatus", ["approved"]),
  ],
  "voucher-composer": ({ fmt }) => [
    act(
      "voucher-composer",
      "setCredit",
      ["2", 1_050_000],
      b(`Typed the revenue line as ${fmt(1_050_000)}.`, `Førte inntektslinjen som ${fmt(1_050_000)}.`),
    ),
    refused("voucher-composer", "assertBalance", []),
    act(
      "voucher-composer",
      "setCredit",
      ["2", 1_000_000],
      b(`Corrected it to ${fmt(1_000_000)}.`, `Rettet den til ${fmt(1_000_000)}.`),
    ),
    act(
      "voucher-composer",
      "assertBalance",
      [],
      b("Checked again: debit equals credit.", "Sjekket på nytt: debet er lik kredit."),
    ),
    act(
      "voucher-composer",
      "assertPostable",
      [],
      b("Checked: the voucher can be posted, by a person.", "Sjekket: bilaget kan bokføres, av en person."),
    ),
  ],
  "bank-reconciliation": () => [
    act(
      "bank-reconciliation",
      "suggestMatch",
      [["b2"], ["p2", "p3"]],
      b(
        "Suggested the Brattli payment against invoices 1002 and 1003.",
        "Foreslo innbetalingen fra Brattli mot faktura 1002 og 1003.",
      ),
    ),
    read("bank-reconciliation", (e) =>
      b(
        `Reads ${list(e?.matches).length} suggestions waiting for a person, ${list(e?.unmatchedBankLines).length} bank lines open.`,
        `Leser ${list(e?.matches).length} forslag som venter på en person, ${list(e?.unmatchedBankLines).length} banklinjer åpne.`,
      ),
    ),
    refused("bank-reconciliation", "assertReconciled", []),
  ],
  "approval-chain": () => [
    read("approval-chain", (e) =>
      b(
        `Reads status ${String(e?.status)} at level ${String(e?.currentLevel)}; who may decide: ${list<string>(e?.mayDecide).join(", ")}.`,
        `Leser status ${String(e?.status)} på nivå ${String(e?.currentLevel)}; hvem kan bestemme: ${list<string>(e?.mayDecide).join(", ")}.`,
      ),
    ),
    refused("approval-chain", "assertApproved", []),
    refused("approval-chain", "approve", []),
  ],
  "period-lock": () => [
    act(
      "period-lock",
      "assertPostingAllowed",
      ["2026-02-10"],
      b("2026-02-10 can be posted: the period is open.", "2026-02-10 kan bokføres: perioden er åpen."),
    ),
    refused("period-lock", "assertPostingAllowed", ["2026-01-15"]),
    refused("period-lock", "assertPostingAllowed", ["2025-12-31"]),
  ],
  "close-checklist": () => [
    refused("close-checklist", "completeTask", ["vat"]),
    act(
      "close-checklist",
      "completeTask",
      ["bank"],
      b(
        "Completed the bank task, recorded as done by the agent; a second person signs it off.",
        "Fullførte bankoppgaven, ført som gjort av agenten; en annen person kontrollsignerer.",
      ),
    ),
    refused("close-checklist", "assertReadyToClose", []),
  ],
  "invoice-editor": ({ fmt }) => [
    act(
      "invoice-editor",
      "addLine",
      [{ description: "Oppfølging november", quantity: 2, unitPriceMinor: 145_000, taxRate: 25 }],
      (e) =>
        b(
          `Added a line; the total is now ${fmt(num((e?.totals as { grossMinor?: number } | undefined)?.grossMinor))}, computed, never set.`,
          `La til en linje; totalen er nå ${fmt(num((e?.totals as { grossMinor?: number } | undefined)?.grossMinor))}, beregnet, aldri satt.`,
        ),
    ),
    act(
      "invoice-editor",
      "assertFinalizable",
      [],
      b("Checked: the draft can be finalized.", "Sjekket: utkastet kan ferdigstilles."),
    ),
    refused("invoice-editor", "finalize", []),
  ],
  "payment-batch": () => [
    refused("payment-batch", "assertReleasable", []),
    act(
      "payment-batch",
      "removePayment",
      ["p3"],
      b("Removed the duplicate payment p3.", "Fjernet den doble betalingen p3."),
    ),
    refused("payment-batch", "assertReleasable", []),
  ],
  "supplier-invoice-inbox": () => [
    act(
      "supplier-invoice-inbox",
      "correctField",
      ["si-2", "grossMinor", 438_000],
      b(
        "Corrected the gross on Brattli's invoice to NOK 4,380.00.",
        "Rettet bruttobeløpet på fakturaen fra Brattli til 4 380,00.",
      ),
    ),
    act(
      "supplier-invoice-inbox",
      "confirmField",
      ["si-2", "supplierOrgNumber"],
      b(
        "Confirmed the organisation number read with low confidence.",
        "Bekreftet organisasjonsnummeret som ble lest med lav sikkerhet.",
      ),
    ),
    act(
      "supplier-invoice-inbox",
      "proposeCoding",
      ["si-2", "6800", "1"],
      b("Proposed account 6800 with VAT code 1.", "Foreslo konto 6800 med mva-kode 1."),
    ),
    refused("supplier-invoice-inbox", "assertApprovable", ["si-3"]),
  ],
  "evidence-list": () => [
    read("evidence-list", (e) =>
      b(
        `Reads what is missing: ${list<string>(e?.missing).join(", ") || "nothing"}.`,
        `Leser hva som mangler: ${list<string>(e?.missing).join(", ") || "ingenting"}.`,
      ),
    ),
    act(
      "evidence-list",
      "linkAttachment",
      ["att-2", "receipt"],
      b("Linked kvittering-kontorstol.jpg as the receipt.", "Knyttet kvittering-kontorstol.jpg som kvittering."),
    ),
    act(
      "evidence-list",
      "assertEvidenced",
      [],
      b("Checked: the entry has the evidence it needs.", "Sjekket: posten har dokumentasjonen den trenger."),
    ),
  ],
  "expense-claim": ({ fmt }) => [
    act(
      "expense-claim",
      "addLine",
      [{ kind: "mileage", date: "2026-10-08", description: "Voss–Bergen", distanceKm: 102 }],
      (e) =>
        b(
          `Added 102 km; the policy sets the rate, the total is ${fmt(num(e?.totalMinor))}.`,
          `La til 102 km; reglene setter satsen, totalen er ${fmt(num(e?.totalMinor))}.`,
        ),
    ),
    read("expense-claim", (e) =>
      b(
        `Reads ${list(e?.exceptions).length} policy exceptions. Accepting one is a person's decision.`,
        `Leser ${list(e?.exceptions).length} avvik fra reglene. Å godta et avvik er en persons beslutning.`,
      ),
    ),
    act(
      "expense-claim",
      "assertSubmittable",
      [],
      b(
        "Checked: the claim can be submitted, by the claimant.",
        "Sjekket: reiseregningen kan sendes inn, av den som krever.",
      ),
    ),
  ],
  "ledger-table": () => [
    act("ledger-table", "openAccount", ["1500"], (e) =>
      b(
        `Opened account 1500: ${list(e?.rows).length} entries.`,
        `Åpnet konto 1500: ${list(e?.rows).length} posteringer.`,
      ),
    ),
    act("ledger-table", "showVoucher", ["1002"], (e) =>
      b(
        `Opened voucher 1002, balanced = ${String((e?.voucherSummary as { balanced?: boolean } | null)?.balanced)}.`,
        `Åpnet bilag 1002, balanced = ${String((e?.voucherSummary as { balanced?: boolean } | null)?.balanced)}.`,
      ),
    ),
    act("ledger-table", "back", [], b("Back to the account.", "Tilbake til kontoen.")),
    act("ledger-table", "back", [], b("Back to the trial balance.", "Tilbake til saldobalansen.")),
  ],
  "aged-balances": () => [
    act(
      "aged-balances",
      "overdue",
      [60],
      b("Asked who is more than 60 days overdue.", "Spurte hvem som er mer enn 60 dager over forfall."),
    ),
    act("aged-balances", "openParty", ["c3"], (e) =>
      b(
        `Opened ${String((e?.party as { partyName?: string } | null)?.partyName ?? "the customer")}.`,
        `Åpnet ${String((e?.party as { partyName?: string } | null)?.partyName ?? "kunden")}.`,
      ),
    ),
    act("aged-balances", "back", [], b("Back to all customers.", "Tilbake til alle kundene.")),
  ],
  "vat-return": () => [
    act(
      "vat-return",
      "openBox",
      ["sales-high-base"],
      b("Opened the box for sales at the high rate.", "Åpnet posten for salg med høy sats."),
    ),
    act("vat-return", "back", [], b("Back to the return.", "Tilbake til meldingen.")),
    refused("vat-return", "assertReady", []),
  ],
  "audit-workpaper": ({ fmt }) => [
    read("audit-workpaper", (e) =>
      b(
        `Reads a sample of ${num((e?.summary as { selected?: number } | undefined)?.selected)} items, drawn from seed 2026-10-31, all untested.`,
        `Leser et utvalg på ${num((e?.summary as { selected?: number } | undefined)?.selected)} poster, trukket fra frøet 2026-10-31, alle utestet.`,
      ),
    ),
    act(
      "audit-workpaper",
      "setResult",
      (e) => [nthItem(e, 0), "ok"],
      b(
        "Tested the first item: no exception, marked as the agent's.",
        "Testet første post: ingen avvik, merket som agentens.",
      ),
    ),
    act(
      "audit-workpaper",
      "setTickMark",
      (e) => [nthItem(e, 0), "✓"],
      b("Ticked it: agreed to invoice.", "Krysset av: avstemt mot faktura."),
    ),
    act(
      "audit-workpaper",
      "setResult",
      (e) => [nthItem(e, 1), "exception", 120_000],
      b(`Second item: an exception of ${fmt(120_000)}.`, `Andre post: et avvik på ${fmt(120_000)}.`),
    ),
    refused("audit-workpaper", "assertReadyForSignOff", []),
  ],
  "audit-findings": () => [
    act(
      "audit-findings",
      "draftFinding",
      [{ title: "Leverandør uten rammeavtale", category: "compliance", basis: "reported" }],
      b("Drafted a finding on what a party said.", "Skrev et utkast til funn ut fra det en part sa."),
    ),
    refused("audit-findings", "editFinding", ["F-03", { title: "Nærstående part" }]),
    act(
      "audit-findings",
      "assertConfirmable",
      ["F-01"],
      b("Checked F-01: ready for a person to confirm.", "Sjekket F-01: klar til at en person bekrefter."),
    ),
  ],
  "client-requests": () => [
    act(
      "client-requests",
      "draftRequest",
      [
        {
          title: "Lagerliste per 31.12.",
          recipientName: "Hanne Vik",
          recipientEmail: "hanne.vik@klient.example",
          area: "Varelager",
          dueDate: "2026-11-30",
        },
      ],
      b("Drafted a request for the stock list.", "Skrev et utkast til forespørsel om lagerlisten."),
    ),
    read("client-requests", (e) =>
      b(
        `Reads overdue: ${list<string>(e?.overdue).join(", ") || "none"}. The recipient's email is not in what it reads.`,
        `Leser forfalt: ${list<string>(e?.overdue).join(", ") || "ingen"}. Mottakerens e-post er ikke med i det den leser.`,
      ),
    ),
    refused("client-requests", "send", ["R-3"]),
  ],
  "deal-pipeline": () => [
    act(
      "deal-pipeline",
      "setValue",
      ["D-2", { valueStatus: "estimate", valueSource: "Samtale 18. nov." }],
      b("Gave D-2's amount a source, so it counts.", "Ga beløpet på D-2 en kilde, så det telles med."),
    ),
    act(
      "deal-pipeline",
      "moveDeal",
      ["D-2", "tilbud"],
      b("Moved D-2 to Tilbud sendt.", "Flyttet D-2 til Tilbud sendt."),
    ),
    read("deal-pipeline", (e) => {
      const nok = list<{ currency: string; weightedMinor: number }>(e?.forecast).find((t) => t.currency === "NOK");
      const kr = ((nok?.weightedMinor ?? 0) / 100).toLocaleString("nb-NO");
      return b(`Reads the weighted forecast: NOK ${kr}.`, `Leser den vektede prognosen: ${kr} kr.`);
    }),
    refused("deal-pipeline", "moveDeal", ["D-1", "vunnet"]),
  ],
  "activity-timeline": () => [
    act(
      "activity-timeline",
      "logActivity",
      [{ kind: "note", subject: "Kunden vil starte i januar" }],
      b("Logged a note.", "Logget et notat."),
    ),
    act("activity-timeline", "completeTask", ["T-1"], b("Marked T-1 done.", "Markerte T-1 som gjort.")),
    act(
      "activity-timeline",
      "scheduleTask",
      [{ subject: "Ring om oppstart", dueDate: "2026-12-02", assigneeId: "kari" }],
      b("Scheduled a call for 2 December.", "Planla en samtale 2. desember."),
    ),
    refused("activity-timeline", "remove", ["A-2"]),
  ],
  "funnel-chart": () => [
    read("funnel-chart", (e) => {
      const steps = list<{ label: string; overallConversionPct: number }>(e?.steps);
      const last = steps.at(-1);
      return b(
        `Reads the funnel: ${last?.overallConversionPct ?? 0} % of leads were won.`,
        `Leser trakten: ${String(last?.overallConversionPct ?? 0).replace(".", ",")} % av leadene ble vunnet.`,
      );
    }),
    act("funnel-chart", "drill", ["meeting"], b("Drilled into the meeting step.", "Boret seg ned i møtesteget.")),
    refused("funnel-chart", "drill", ["demo"]),
  ],
  "forecast-chart": () => [
    act("forecast-chart", "setGrouping", ["quarter"], b("Grouped by quarter.", "Grupperte per kvartal.")),
    read("forecast-chart", (e) => {
      const weighted = ((e?.totals as { weightedMinor?: number } | undefined)?.weightedMinor ?? 0) / 100;
      return b(
        `Reads the weighted forecast: NOK ${weighted.toLocaleString("en-US")}.`,
        `Leser den vektede prognosen: ${weighted.toLocaleString("nb-NO")} kr.`,
      );
    }),
    refused("forecast-chart", "setGrouping", ["week"]),
  ],
  "recurring-revenue": () => [
    act("recurring-revenue", "drill", ["churn"], b("Drilled into churn.", "Boret seg ned i tapt.")),
    act("recurring-revenue", "setView", ["arr"], b("Switched to ARR.", "Byttet til ARR.")),
    read("recurring-revenue", (e) =>
      b(
        `Reads that opening plus the movements equals closing: ${String(e?.reconciles)}.`,
        `Leser at inngående pluss bevegelsene er utgående: ${e?.reconciles ? "ja" : "nei"}.`,
      ),
    ),
    refused("recurring-revenue", "setView", ["weekly"]),
  ],
  "stage-duration": () => [
    read("stage-duration", (e) =>
      b(
        `Reads the deals over target: ${list<string>(e?.overTarget).join(", ") || "none"}.`,
        `Leser avtalene over målet: ${list<string>(e?.overTarget).join(", ") || "ingen"}.`,
      ),
    ),
    act("stage-duration", "drill", ["tilbud"], b("Drilled into Tilbud sendt.", "Boret seg ned i Tilbud sendt.")),
    refused("stage-duration", "drill", ["vunnet"]),
  ],
  button: () => [
    read(undefined, (_e, all) =>
      b(
        `Reads ${all.length} buttons by their words: ${all.map((entry) => `"${String(entry.label)}"`).join(", ")}.`,
        `Leser ${all.length} knapper etter ordene sine: ${all.map((entry) => `«${String(entry.label)}»`).join(", ")}.`,
      ),
    ),
    act("button", "press", [], b("Pressed Save draft.", "Trykket Lagre utkast."), { nth: 0 }),
    refused("button", "press", [], { nth: 1 }),
  ],
  "confirm-dialog": () => [
    act("alert-dialog", "setOpen", [true], b("Opened the question.", "Åpnet spørsmålet.")),
    read("alert-dialog", (e) =>
      b(
        `Reads the question: "${list<string>(e?.text)[0] ?? ""}"`,
        `Leser spørsmålet: «${list<string>(e?.text)[0] ?? ""}»`,
      ),
    ),
    refused("alert-dialog", "press", (e) => [list<string>(e.buttons).at(-1) ?? ""]),
    act(
      "alert-dialog",
      "press",
      (e) => [list<string>(e.buttons)[0] ?? ""],
      b("Cancelled: that answer is free.", "Avbrøt: det svaret er fritt."),
    ),
  ],
  "document-signoff": () => [
    act(
      "document-signoff",
      "assertSignable",
      [],
      b("Checked: nothing stops a signature now.", "Sjekket: ingenting hindrer en signatur nå."),
    ),
    read("document-signoff", (e) =>
      b(
        `Reads ${list<{ mark: string }>(e?.levels)
          .map((level) => level.mark)
          .join(", ")}: the performed signature was made on an earlier version.`,
        `Leser ${list<{ mark: string }>(e?.levels)
          .map((level) => level.mark)
          .join(", ")}: utført-signaturen ble gjort på en tidligere versjon.`,
      ),
    ),
    refused("document-signoff", "sign", ["reviewed"]),
  ],
  "document-editor": () => [
    read("document-editor", (e) =>
      b(
        `Reads the page as ${list(e?.blocks).length} blocks, and ${list(e?.mentions).length} things it may mention.`,
        `Leser siden som ${list(e?.blocks).length} blokker, og ${list(e?.mentions).length} ting den kan nevne.`,
      ),
    ),
    act(
      "document-editor",
      "findBlocks",
      ["January"],
      b("Found the block about the January invoices.", "Fant blokken om januarfakturaene."),
    ),
    act(
      "document-editor",
      "insertBlock",
      [
        {
          after: "b4",
          type: "callout",
          text: "Conclusion: cut-off is fair once the two January invoices move to next year.",
          mentions: ["e1042"],
          reason: "Draft the conclusion from the test",
        },
      ],
      b(
        "Proposed a conclusion that names the invoice. The page is unchanged until a person accepts.",
        "Foreslo en konklusjon som nevner fakturaen. Siden er uendret til en person godtar.",
      ),
    ),
    refused("document-editor", "accept", ["p1"]),
  ],
  "sheet-stack": () => [
    read("sheet-stack", (e) =>
      b(
        `Reads ${list(e?.open).length} open sheets; the top one is ${String(e?.top)}.`,
        `Leser ${list(e?.open).length} åpne ark; øverst ligger ${String(e?.top)}.`,
      ),
    ),
    act("sheet-stack", "back", ["05.3.2"], (e) =>
      b(
        `Went back to 05.3.2; ${list(e?.open).length} sheets open.`,
        `Gikk tilbake til 05.3.2; ${list(e?.open).length} ark åpne.`,
      ),
    ),
    refused("sheet-stack", "back", ["05.9"]),
    act("sheet-stack", "close", [], (e) =>
      b(`Closed the top sheet; ${String(e?.top)} is on top.`, `Lukket øverste ark; ${String(e?.top)} ligger øverst.`),
    ),
  ],
  "chart-of-accounts": ({ country }) => {
    const norway = country === "NO";
    const matching = (e: Entry | undefined) => num((e?.view as { matching?: number } | undefined)?.matching);
    return [
      act("chart-of-accounts", "find", [norway ? "rekvisita" : "software"], (e) =>
        b(
          `Searched the chart: ${matching(e)} account matches, ${String(list<{ number: string; name: string }>(e?.rows)[0]?.number)} ${String(list<{ number: string; name: string }>(e?.rows)[0]?.name)}.`,
          `Søkte i kontoplanen: ${matching(e)} konto passer, ${String(list<{ number: string; name: string }>(e?.rows)[0]?.number)} ${String(list<{ number: string; name: string }>(e?.rows)[0]?.name)}.`,
        ),
      ),
      norway
        ? act(
            "chart-of-accounts",
            "mapStandard",
            ["6800", "6800"],
            b(
              "Mapped 6800 to SAF-T standard account 6800: the chart has no missing mapping left.",
              "Koblet 6800 til SAF-T-standardkonto 6800: ingen kontoer mangler kobling.",
            ),
          )
        : act(
            "chart-of-accounts",
            "setVatCode",
            ["6300", "TAX0"],
            b(
              "Set 6300 Software subscriptions to no sales tax.",
              "Satte 6300 Software subscriptions til uten salgsskatt.",
            ),
          ),
      act("chart-of-accounts", "find", [""], b("Cleared the search.", "Fjernet søket.")),
      act(
        "chart-of-accounts",
        "propose",
        [
          norway
            ? {
                number: "6810",
                name: "Programvare og lisenser",
                type: "expense",
                vatCode: "1",
                standardAccount: "6810",
              }
            : { number: "6310", name: "Cloud hosting", type: "expense" },
        ],
        b(
          "Proposed a new account. It waits on screen until a person commits it.",
          "Foreslo en ny konto. Den venter på skjermen til en person tar den i bruk.",
        ),
      ),
      refused("chart-of-accounts", "propose", [{ number: norway ? "1920" : "1010", type: "liability" }]),
    ];
  },
  "fixed-asset-register": ({ fmt }) => [
    act(
      "fixed-asset-register",
      "openAsset",
      ["a1"],
      b("Opened the van's schedule.", "Åpnet avskrivningsplanen for varebilen."),
    ),
    act("fixed-asset-register", "back", [], b("Back to the register.", "Tilbake til registeret.")),
    act("fixed-asset-register", "proposeRun", ["2026-10"], (e) =>
      b(
        `Proposed October's run: ${fmt(num((e?.proposal as { totalMinor?: number } | null)?.totalMinor))}. A person confirms it.`,
        `Foreslo oktoberkjøringen: ${fmt(num((e?.proposal as { totalMinor?: number } | null)?.totalMinor))}. En person bekrefter den.`,
      ),
    ),
  ],
  "data-table": () => [
    act(
      "data-table",
      "setSort",
      ["debit", "desc"],
      b("Sorted by debit, largest first.", "Sorterte på debet, største først."),
    ),
    act("data-table", "setPage", [2], (e) =>
      b(
        `Page ${num((e?.view as { page?: number })?.page)} of ${num((e?.view as { pageCount?: number })?.pageCount)}.`,
        `Side ${num((e?.view as { page?: number })?.page)} av ${num((e?.view as { pageCount?: number })?.pageCount)}.`,
      ),
    ),
    act("data-table", "setFilter", ["account", "1500"], (e) =>
      b(
        `Filtered to account 1500: ${num((e?.view as { matching?: number })?.matching)} of ${num((e?.view as { total?: number })?.total)} rows.`,
        `Filtrerte på konto 1500: ${num((e?.view as { matching?: number })?.matching)} av ${num((e?.view as { total?: number })?.total)} rader.`,
      ),
    ),
    act("data-table", "clearFilters", [], b("Cleared the filter.", "Fjernet filteret.")),
  ],
  "kpi-stat": ({ fmt }) => [
    read("kpi-stat", (e) =>
      b(
        `Reads ${String(e?.label)}: ${fmt(num(e?.valueMinor))}, ${num(e?.deltaPct)}% ${String(e?.direction)} from ${String(e?.previousLabel)}, favourable = ${String(e?.favourable)}.`,
        `Leser ${String(e?.label)}: ${fmt(num(e?.valueMinor))}, ${num(e?.deltaPct)} % ${e?.direction === "up" ? "opp" : "ned"} fra ${String(e?.previousLabel)}, favourable = ${String(e?.favourable)}.`,
      ),
    ),
  ],
  "trend-chart": () => [
    act("trend-chart", "setRange", ["6m"], (e) =>
      b(
        `Range set to six months: ${String(e?.from)} to ${String(e?.to)}.`,
        `Perioden satt til seks måneder: ${String(e?.from)} til ${String(e?.to)}.`,
      ),
    ),
    act("trend-chart", "drill", ["2026-10"], b("Drilled into October.", "Gikk inn i oktober.")),
    act("trend-chart", "setRange", ["12m"], b("Back to twelve months.", "Tilbake til tolv måneder.")),
  ],
  "bar-chart": ({ fmt }) => [
    act("bar-chart", "setLimit", [3], (e) =>
      b(
        `Top three, the other ${num(e?.otherCount)} folded into Other.`,
        `De tre største, de andre ${num(e?.otherCount)} samlet i Annet.`,
      ),
    ),
    act("bar-chart", "drill", ["5000"], b("Drilled into 5000 Lønn.", "Gikk inn i 5000 Lønn.")),
    read("bar-chart", (e) =>
      b(
        `Reads the largest: ${String(list<{ label: string }>(e?.rows)[0]?.label)}, of ${fmt(num(e?.totalMinor))} in all.`,
        `Leser den største: ${String(list<{ label: string }>(e?.rows)[0]?.label)}, av ${fmt(num(e?.totalMinor))} totalt.`,
      ),
    ),
  ],
  "aging-chart": ({ fmt }) => [
    act("aging-chart", "drill", ["over-90"], b("Drilled into over 90 days.", "Gikk inn i over 90 dager.")),
    read("aging-chart", (e) =>
      b(
        `Reads ${num(e?.overdueSharePct)}% overdue; furthest behind is ${String(list<{ partyName: string }>(e?.topOverdue)[0]?.partyName)}, ${fmt(num(list<{ overdueMinor: number }>(e?.topOverdue)[0]?.overdueMinor))}.`,
        `Leser ${num(e?.overdueSharePct)} % over forfall; den som ligger lengst etter, er ${String(list<{ partyName: string }>(e?.topOverdue)[0]?.partyName)}, ${fmt(num(list<{ overdueMinor: number }>(e?.topOverdue)[0]?.overdueMinor))}.`,
      ),
    ),
  ],
  "cashflow-waterfall": ({ fmt }) => [
    act("cashflow-waterfall", "drill", ["salaries"], b("Drilled into salaries.", "Gikk inn i lønn.")),
    read("cashflow-waterfall", (e) =>
      b(
        `Reads opening ${fmt(num(e?.openingMinor))}, closing ${fmt(num(e?.closingMinor))}, ${list(e?.issues).length === 0 ? "and they add up" : "and they do not add up"}.`,
        `Leser inngående ${fmt(num(e?.openingMinor))}, utgående ${fmt(num(e?.closingMinor))}, ${list(e?.issues).length === 0 ? "og det går opp" : "og det går ikke opp"}.`,
      ),
    ),
  ],
  "account-picker": ({ profile }) => [
    act("account-picker", "setAccount", [profile.accounts.expense.number], (e) =>
      b(
        `Account set to ${String(e?.value)} ${String(e?.name)}.`,
        `Konto satt til ${String(e?.value)} ${String(e?.name)}.`,
      ),
    ),
    refused("account-picker", "setAccount", ["9999"]),
  ],
  "tax-code-select": () => [
    act(
      "tax-code-select",
      "setTaxCode",
      (e) => [itemValues(e)[0] ?? ""],
      (e) =>
        b(
          `Tax code set to ${String(e?.value)}: ${num(e?.percent)}%.`,
          `Avgiftskode satt til ${String(e?.value)}: ${num(e?.percent)} %.`,
        ),
    ),
    refused("tax-code-select", "setTaxCode", (e) => [itemValues(e)[0]?.startsWith("MVA") ? "MVA99" : "TAX99"]),
    act(
      "tax-code-select",
      "setTaxCode",
      (e) => [itemValues(e).at(-1) ?? ""],
      (e) =>
        b(
          `Back to ${String(e?.value)}: ${num(e?.percent)}%.`,
          `Tilbake til ${String(e?.value)}: ${num(e?.percent)} %.`,
        ),
    ),
  ],
  "payment-confirm": () => [
    read("input", (e) =>
      b(
        `Reads the confirmation field, marked: ${String(e?.confirm)}.`,
        `Leser bekreftelsesfeltet, merket: ${String(e?.confirm)}.`,
      ),
    ),
    refused("input", "setValue", ["APPROVE"]),
  ],
  "approval-gate": () => [
    act("dialog", "setOpen", [true], b("Opened the attestation.", "Åpnet attesteringen.")),
    refused("input", "setValue", ["APPROVE"]),
    refused("dialog", "press", (e) => [list<string>(e.buttons).at(-1) ?? ""]),
    act(
      "dialog",
      "press",
      (e) => [list<string>(e.buttons)[0] ?? ""],
      b("Cancelled: that answer is free.", "Avbrøt: det svaret er fritt."),
    ),
  ],
  "exception-banner": () => [
    read(undefined, (_e, all) =>
      b(
        `Reads ${all.length} buttons, each marked for a person.`,
        `Leser ${all.length} knapper, hver merket for en person.`,
      ),
    ),
    refused("button", "press", [], { nth: 0 }),
  ],
  "sca-prompt": () => [
    read("button", (e) =>
      b(
        `Reads "${String(e?.label)}", marked: ${String(e?.confirm)}.`,
        `Leser «${String(e?.label)}», merket: ${String(e?.confirm)}.`,
      ),
    ),
    refused("button", "press", []),
  ],
  "icon-button": () => [
    read(undefined, (_e, all) =>
      b(
        `Reads ${all.length} buttons by name: ${all.map((entry) => String(entry.label)).join(", ")}.`,
        `Leser ${all.length} knapper etter navn: ${all.map((entry) => String(entry.label)).join(", ")}.`,
      ),
    ),
    act("button", "press", [], (e) => b(`Pressed "${String(e?.label)}".`, `Trykket på «${String(e?.label)}».`), {
      nth: 1,
    }),
    refused("button", "press", [], { nth: 2 }),
  ],
  "text-link": readsNothing(
    b(
      "A link is navigation for the person, not an agent action, so it has no entry.",
      "En lenke er navigasjon for personen, ikke en agenthandling, så den har ingen oppføring.",
    ),
  ),
  card: () => [
    read(undefined, (_e, all) =>
      b(
        `The card adds no entry of its own. snapshot() lists the ${all.length} buttons in its header, by name.`,
        `Kortet gir ingen egen oppføring. snapshot() viser de ${all.length} knappene i toppen, etter navn.`,
      ),
    ),
    act("button", "press", [], (e) => b(`Pressed "${String(e?.label)}".`, `Trykket på «${String(e?.label)}».`)),
  ],
  field: () => [
    read("input", (e) =>
      b(
        `Reads an input named "${String(e?.label)}", value "${String(e?.value)}".`,
        `Leser et felt med navnet «${String(e?.label)}», verdi «${String(e?.value)}».`,
      ),
    ),
    act("input", "setValue", ["Brattli Entreprenør AS"], (e) =>
      b(`Filled it with "${String(e?.value)}".`, `Fylte det ut med «${String(e?.value)}».`),
    ),
  ],
  toolbar: () => [
    read("toolbar", (e) =>
      b(
        `Reads the toolbar "${String(e?.label)}": ${list<string>(e?.buttons).join(", ")}.`,
        `Leser verktøylinjen «${String(e?.label)}»: ${list<string>(e?.buttons).join(", ")}.`,
      ),
    ),
    act(
      "toolbar",
      "press",
      (e) => [list<string>(e.buttons)[1] ?? ""],
      (e) =>
        b(
          `Pressed "${list<string>(e?.buttons)[1] ?? ""}" by its name.`,
          `Trykket på «${list<string>(e?.buttons)[1] ?? ""}» etter navnet.`,
        ),
    ),
    refused("toolbar", "press", (e) => [list<string>(e.buttons).at(-1) ?? ""]),
  ],
  "agent-cursor": ({ fmt }) => [
    act("amount-field", "setMinor", [1_550_000], (e) =>
      b(
        `The pointer went to the amount first, then set it to ${fmt(num(e?.minor))}.`,
        `Pekeren gikk til beløpet først, og satte det så til ${fmt(num(e?.minor))}.`,
      ),
    ),
  ],
  "agent-presence": ({ fmt }) => [
    act("amount-field", "setMinor", [1_550_000], (e) =>
      b(
        `Set the amount to ${fmt(num(e?.minor))}; the marker named the field while it worked.`,
        `Satte beløpet til ${fmt(num(e?.minor))}; merkelappen viste feltet mens den jobbet.`,
      ),
    ),
  ],
  "agent-proposal": ({ fmt }) => [
    read("amount-field", (e) =>
      b(
        `Reads the amount: ${fmt(num(e?.minor))}. Keep and Revert are not among its controls, and both are marked for a person: only the person settles a proposal.`,
        `Leser beløpet: ${fmt(num(e?.minor))}. Behold og Angre er ikke blant kontrollene den ser, og begge er merket for en person: bare personen avgjør et forslag.`,
      ),
    ),
  ],
};

function nthItem(entry: Entry, index: number): string {
  const items = list<{ id?: string }>((entry.workpaper as { items?: unknown } | undefined)?.items);
  return items[index]?.id ?? "";
}

/**
 * The height each preview's sheet holds, in px, [below 768px, 768px and up]:
 * the tallest the control gets on load and through its demo, measured on the
 * rendered page at 390px and 1280px wide and rounded up. A control that
 * mounts, measures itself or changes rows then never pushes the page down.
 */
export const PREVIEW_RESERVE: Record<string, readonly [number, number]> = {
  money: [88, 96],
  "amount-field": [88, 96],
  "amount-input": [88, 96],
  "money-amount": [88, 96],
  "currency-select": [88, 88],
  "bank-account-input": [136, 144],
  "payment-reference-input": [136, 144],
  "organization-number-input": [160, 168],
  "iban-input": [136, 144],
  "financial-date-field": [200, 200],
  "accounting-period-select": [112, 120],
  "invoice-number-input": [136, 144],
  "attestation-status": [88, 88],
  "voucher-lines": [280, 288],
  "voucher-composer": [344, 336],
  "bank-reconciliation": [928, 576],
  "approval-chain": [376, 328],
  "period-lock": [320, 264],
  "close-checklist": [664, 424],
  "invoice-editor": [528, 512],
  "payment-batch": [608, 592],
  "supplier-invoice-inbox": [2072, 1048],
  "evidence-list": [704, 400],
  "expense-claim": [1144, 760],
  "ledger-table": [992, 640],
  "aged-balances": [568, 392],
  "vat-return": [848, 712],
  "audit-workpaper": [1040, 872],
  "audit-findings": [1632, 944],
  "client-requests": [1192, 848],
  "deal-pipeline": [1400, 760],
  "activity-timeline": [1040, 880],
  "funnel-chart": [560, 520],
  "forecast-chart": [640, 600],
  "recurring-revenue": [560, 520],
  "stage-duration": [520, 480],
  button: [184, 176],
  "confirm-dialog": [88, 96],
  toasts: [88, 96],
  "agent-status": [136, 88],
  "document-signoff": [592, 336],
  "document-editor": [720, 640],
  "sheet-stack": [712, 736],
  "chart-of-accounts": [4656, 2104],
  "fixed-asset-register": [1152, 848],
  "data-table": [696, 592],
  "kpi-stat": [120, 128],
  "trend-chart": [432, 392],
  "bar-chart": [488, 480],
  "aging-chart": [656, 520],
  "cashflow-waterfall": [592, 560],
  "account-picker": [88, 88],
  "tax-code-select": [88, 88],
  "payment-confirm": [408, 416],
  "approval-gate": [88, 88],
  "exception-banner": [248, 248],
  "sca-prompt": [272, 256],
  "audit-trail": [400, 312],
  "country-toggle": [88, 96],
};
