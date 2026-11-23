type T = <V>(en: V, nb: V) => V;

/** The control catalogue (packages/react/docs/llms.txt), grouped the way a team reads it. */
export const CATALOGUE = (t: T): { label: string; items: string[]; text: string }[] => [
  {
    label: t("Fields", "Felt"),
    items: [
      "AmountField",
      "AccountPicker",
      "TaxCodeSelect",
      "CurrencySelect",
      "FinancialDateField",
      "AccountingPeriodSelect",
      "BankAccountInput",
      "IbanInput",
      "PaymentReferenceInput",
      "OrganizationNumberInput",
      "InvoiceNumberInput",
    ],
    text: t(
      "Amounts in minor units, closed lists for accounts and VAT codes, mod 11 checks, KID generation.",
      "Beløp i øre, lukkede lister for konto og mva-koder, mod 11-kontroll, KID-generering.",
    ),
  },
  {
    label: t("Workflow", "Arbeidsflyt"),
    items: [
      "VoucherComposer",
      "InvoiceEditor",
      "SupplierInvoiceInbox",
      "PaymentBatch",
      "BankReconciliation",
      "ApprovalChain",
      "PeriodLock",
      "CloseChecklist",
      "ExpenseClaim",
      "EvidenceList",
      "FixedAssetRegister",
      "AttestationStatus",
    ],
    text: t(
      "Balanced vouchers, separation of duties, two people for a payment run, locked periods, credit notes after finalizing.",
      "Bilag i balanse, arbeidsdeling, to personer for en betalingsbunt, låste perioder, kreditnota etter ferdigstilling.",
    ),
  },
  {
    label: t("Reporting", "Rapportering"),
    items: ["LedgerTable", "AgedBalances", "VatReturn"],
    text: t(
      "From trial balance to voucher and back, aging buckets, VAT boxes from your own schema.",
      "Fra saldobalanse til bilag og tilbake, aldersfordeling, mva-poster fra deres eget oppsett.",
    ),
  },
  {
    label: t("Audit", "Revisjon"),
    items: ["AuditWorkpaper", "AuditFindings", "ClientRequests", "DocumentSignoff", "SheetStack"],
    text: t(
      "Reproducible samples, a findings register that keeps confidential findings out of the agent's view, requests to the client, and three-level sign-off that marks a later edit.",
      "Reproduserbare utvalg, et funnregister som holder fortrolige funn unna agenten, forespørsler til klienten, og signering i tre nivåer som markerer en senere endring.",
    ),
  },
  {
    label: t("Data and charts", "Data og grafer"),
    items: ["DataTable", "KpiStat", "TrendChart", "BarChart", "AgingChart", "CashflowWaterfall"],
    text: t(
      "Sort, search, pages, totals and CSV that behave the same everywhere. Charts an agent reads as numbers, not pixels.",
      "Sortering, søk, sider, summer og CSV som oppfører seg likt overalt. Grafer en agent leser som tall, ikke piksler.",
    ),
  },
  {
    label: t("Countries", "Land"),
    items: [],
    text: t(
      "Norway: kontonummer and organisasjonsnummer (mod 11), KID, MVA codes and terms. United States: ABA routing and account, EIN, memo. Norway and US are supported. Starter profiles for Sweden, Denmark, the UK and Germany are experimental, and defineProfile for any other.",
      "Norge: kontonummer og organisasjonsnummer (mod 11), KID, mva-koder og -terminer. USA: ABA routing og konto, EIN, memo. Norge og USA er støttet. Startprofiler for Sverige, Danmark, Storbritannia og Tyskland er eksperimentelle, og defineProfile for alle andre.",
    ),
  },
  {
    label: t("Agent ergonomics", "Laget for agenter"),
    items: [],
    text: t(
      "An unknown field is refused with the list of valid ones. An unknown id lists what exists. A value that could mean two things says its unit. An action that takes an object shows its format in the snapshot.",
      "Et ukjent felt avvises med listen over gyldige. En ukjent id lister opp det som finnes. En verdi som kan bety to ting, oppgir enheten. En handling som tar et objekt, viser formatet i øyeblikksbildet.",
    ),
  },
];
