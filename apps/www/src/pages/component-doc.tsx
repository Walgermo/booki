import { formatMoney, money } from "@booki-aui/core/money";
import { suggestMatches, type BankLine, type OpenPost } from "@booki-aui/core/reconciliation";
import type { VoucherLine } from "@booki-aui/core/voucher";
import {
  AccountPicker,
  AccountingPeriodSelect,
  AmountField,
  AmountInput,
  ApprovalGate,
  AttestationStatus,
  AuditTrail,
  BankReconciliation,
  BankAccountInput,
  CountryToggle,
  CurrencySelect,
  ExceptionBanner,
  FinancialDateField,
  IbanInput,
  InvoiceNumberInput,
  MoneyAmount,
  OrganizationNumberInput,
  PaymentConfirm,
  PaymentReferenceInput,
  ScaPrompt,
  TaxCodeSelect,
  useBookiLocale,
  VoucherComposer,
  VoucherLines,
} from "@booki-aui/react";
import { Navigate, useParams } from "react-router-dom";
import { Fragment, useMemo, useRef, useState } from "react";

import { getCatalogItem } from "../catalog";
import { catalogText, groupName } from "../catalog-nb";
import { useLang, usePageMeta, type PageMeta } from "@/lib/lang";
import { AgentDemo } from "../components/agent-demo";
import { AgentView } from "../components/agent-view";
import { SiteAgentCursor } from "../components/site-agent-cursor";
import { InstallBlock } from "../components/install-block";
import { Preview } from "../components/preview";
import { PREVIEW_RESERVE } from "./agent-demos";
import { controlExample, usesBridge } from "./control-examples";
import { GAP_PREVIEWS } from "./gap-previews";
import {
  ApprovalChainPreview,
  CloseChecklistPreview,
  InvoiceEditorPreview,
  PaymentBatchPreview,
  PeriodLockPreview,
} from "./workflow-previews";

const FALLBACK_META: PageMeta = {
  title: { en: "Components · Booki", nb: "Komponenter · Booki" },
  description: {
    en: "Booki's agent-first controls for accounting and auditing.",
    nb: "Bookis agent-first kontroller for regnskap og revisjon.",
  },
};

export function ComponentDocPage() {
  const { name = "" } = useParams();
  const item = getCatalogItem(name);
  const { country, profile } = useBookiLocale();
  const { lang, t } = useLang();
  const sheet = useRef<HTMLDivElement | null>(null);
  // Bumped by the demo's Reset: the preview mounts again, as it was.
  const [run, setRun] = useState(0);
  // Each component page has its own title and description, in both languages.
  const meta = useMemo<PageMeta | null>(() => {
    if (!item) return null;
    const en = catalogText(item, "en");
    const nb = catalogText(item, "nb");
    return {
      title: { en: `${en.title} · Booki`, nb: `${nb.title} · Booki` },
      description: { en: en.description, nb: nb.description },
    };
  }, [item]);
  usePageMeta(meta ?? FALLBACK_META);

  if (!item || item.name === "introduction" || item.name === "installation" || item.name === "demo") {
    return <Navigate to="/docs" replace />;
  }

  const example = controlExample(name, { country, profile });
  const bridgeExample = usesBridge(name);

  // A component that fills the row (two tables) stacks; the rest sit beside
  // what the agent sees, which is the point of the page.
  const stacked = [
    "bank-reconciliation",
    "voucher-composer",
    "approval-chain",
    "period-lock",
    "close-checklist",
    "invoice-editor",
    "payment-batch",
    ...Object.keys(GAP_PREVIEWS),
  ].includes(name ?? "");

  return (
    <article>
      <SiteAgentCursor />
      <p className="site-kicker">{groupName(item.group, lang)}</p>
      <h1 className="site-page-title mt-1 mb-0">{catalogText(item, lang).title}</h1>
      <p className="mt-3 mb-0 max-w-prose text-muted-foreground">{catalogText(item, lang).description}</p>
      <div
        className={
          stacked || name === "money"
            ? "mt-8 grid gap-8"
            : "mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:items-start"
        }
      >
        <Preview
          sheetRef={sheet}
          reserve={PREVIEW_RESERVE[name]}
          above={
            name !== "money" ? <AgentDemo name={name} scope={sheet} onReset={() => setRun((n) => n + 1)} /> : undefined
          }
        >
          <Fragment key={`${name}-${country}-${run}`}>{renderPreview(name, country, profile, t)}</Fragment>
        </Preview>
        {name !== "money" && <AgentView key={`${name}-${country}-${run}`} scope={sheet} />}
      </div>
      {item.install ? (
        <InstallBlock label={t("Install", "Installer")} command={item.install} className="mt-10 mb-0 max-w-prose" />
      ) : null}
      <section className="control-example mt-8 max-w-prose" aria-labelledby="example-title">
        <h2 id="example-title" className="text-lg font-medium">
          {bridgeExample ? t("Try the bridge", "Prøv agentbroen") : t("Usage example", "Brukseksempel")}
        </h2>
        {bridgeExample && (
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "Open this page in a browser and run the example in the console with a fresh preview. Read the current ref from the snapshot before acting.",
              "Åpne siden i en nettleser og kjør eksemplet i konsollen med en fersk forhåndsvisning. Les gjeldende ref fra øyeblikksbildet før du gjør en handling.",
            )}
          </p>
        )}
        <InstallBlock
          label={bridgeExample ? t("Console", "Konsoll") : example.language === "jsx" ? "JSX" : "JavaScript"}
          command={example.code}
          language={example.language}
        />
        <p className="mt-2 text-sm text-muted-foreground">{example.result[lang]}</p>
      </section>
      {item.group === "React" && (
        <p className="mt-4 mb-0 max-w-prose text-sm text-muted-foreground">
          {t("Import from ", "Importer fra ")}
          <code>@booki-aui/react</code>.{" "}
          {t("For Booki's default styling, add ", "For Bookis standardutseende, legg til ")}
          <code>import &quot;@booki-aui/styles&quot;</code>.
        </p>
      )}
    </article>
  );
}

function renderPreview(
  name: string,
  country: string,
  profile: ReturnType<typeof useBookiLocale>["profile"],
  t: ReturnType<typeof useLang>["t"],
) {
  switch (name) {
    case "money":
      return (
        <div className="grid gap-2 font-mono text-sm">
          <div>
            {formatMoney(money(125_00, profile.currency), {
              locale: profile.locale,
            })}
          </div>
          <div>
            {formatMoney(money(-4_250_00, profile.currency), {
              locale: profile.locale,
              accounting: true,
            })}
          </div>
        </div>
      );
    case "amount-field":
      return <AmountFieldPreview />;
    case "amount-input":
      return <AmountInputPreview />;
    case "money-amount":
      return (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <MoneyAmount value={money(12_500_00, profile.currency)} />
          <MoneyAmount value={money(1_250_000_00, profile.currency)} size="lg" />
        </div>
      );
    case "currency-select":
      return <CurrencySelect defaultValue={profile.currency} />;
    case "bank-account-input":
      return (
        <div className="max-w-lg">
          <BankAccountPreview />
        </div>
      );
    case "payment-reference-input":
      return (
        <div className="max-w-sm">
          <PaymentReferencePreview />
        </div>
      );
    case "organization-number-input":
      return (
        <div className="max-w-sm">
          <OrganizationNumberPreview />
        </div>
      );
    case "iban-input":
      return (
        <div className="max-w-sm">
          <IbanPreview />
        </div>
      );
    case "financial-date-field":
      return (
        <div className="grid max-w-sm gap-3">
          <FinancialDatePreview kind="invoice" />
          <FinancialDatePreview kind="due" />
        </div>
      );
    case "accounting-period-select":
      return <AccountingPeriodSelect />;
    case "invoice-number-input":
      return (
        <div className="max-w-sm">
          <InvoiceNumberPreview />
        </div>
      );
    case "attestation-status":
      return <AttestationStatus defaultValue="pending" />;
    case "voucher-lines":
      return (
        <VoucherLines
          lines={[
            {
              id: "1",
              account: profile.accounts.receivable.number,
              accountName: profile.accounts.receivable.name,
              debitMinor: 1_250_000,
              creditMinor: 0,
            },
            {
              id: "2",
              account: profile.accounts.revenue.number,
              accountName: profile.accounts.revenue.name,
              debitMinor: 0,
              creditMinor: 1_000_000,
            },
            {
              id: "3",
              account: profile.accounts.taxPayable.number,
              accountName: profile.accounts.taxPayable.name,
              debitMinor: 0,
              creditMinor: 250_000,
            },
          ]}
        />
      );
    case "voucher-composer":
      return <VoucherComposerPreview profile={profile} />;
    case "bank-reconciliation":
      return <BankReconciliationPreview key={country} />;
    case "approval-chain":
      return <ApprovalChainPreview key={country} />;
    case "period-lock":
      return <PeriodLockPreview key={country} />;
    case "close-checklist":
      return <CloseChecklistPreview key={country} />;
    case "invoice-editor":
      return <InvoiceEditorPreview key={country} currency={profile.currency} />;
    case "payment-batch":
      return <PaymentBatchPreview key={country} currency={profile.currency} />;
    case "account-picker":
      return <AccountPickerPreview profile={profile} />;
    case "tax-code-select":
      return <TaxCodeSelect />;
    case "payment-confirm":
      return (
        <PaymentConfirm
          payee={profile.demo.companyName}
          amount={money(312_250, profile.currency)}
          bankAccount={country === "NO" ? "8601 11 17947" : "021000021 / 123456789"}
          paymentReference={country === "NO" ? "10012342" : "INV-1001"}
        />
      );
    case "approval-gate":
      return (
        <ApprovalGate
          summary={
            <span>
              {t("Post ", "Bokfør ")}
              {formatMoney(money(249_000, profile.currency), {
                locale: profile.locale,
              })}
            </span>
          }
        />
      );
    case "exception-banner":
      return (
        <ExceptionBanner
          reason={t("Tax code missing on line 2", "Mva-kode mangler på linje 2")}
          context={<span>{t("The agent stopped before posting.", "Agenten stoppet før bokføring.")}</span>}
          onReview={() => undefined}
          onDismiss={() => undefined}
        />
      );
    case "sca-prompt":
      return <ScaPrompt />;
    case "audit-trail":
      return (
        <AuditTrail
          events={[
            {
              id: "1",
              at: "2026-11-20T09:12:00Z",
              actor: "nina",
              action: "approve",
              target: t("Voucher 1042", "Bilag 1042"),
              detail: t("Reviewed and attested", "Gjennomgått og attestert"),
            },
            {
              id: "2",
              at: "2026-11-20T09:10:00Z",
              actor: "agent:bookkeeper",
              action: "update",
              target: `${t("Account", "Konto")} ${profile.accounts.bank.number}`,
              detail: t("Changed the amount", "Endret beløpet"),
            },
            {
              id: "3",
              at: "2026-11-19T16:40:00Z",
              actor: "nina",
              action: "review",
              target: t("Exception", "Avvik"),
              detail: t("Cleared after the controller's review", "Lukket etter controllerens gjennomgang"),
            },
          ]}
        />
      );
    case "country-toggle":
      return <CountryToggle />;
    default: {
      const Gap = GAP_PREVIEWS[name];
      if (Gap) return <Gap key={country} />;
      return <p className="text-sm text-muted-foreground">{t("No preview.", "Ingen forhåndsvisning.")}</p>;
    }
  }
}

function AmountFieldPreview() {
  const [minor, setMinor] = useState(12_500_00);
  return <AmountField value={minor} onValueChange={(next) => setMinor(next)} />;
}

function AmountInputPreview() {
  const [minor, setMinor] = useState(12_500_00);
  return (
    <AmountInput
      value={minor}
      onValueChange={(next) => {
        if (next !== null) setMinor(next);
      }}
    />
  );
}

function VoucherComposerPreview({ profile }: { profile: ReturnType<typeof useBookiLocale>["profile"] }) {
  const [lines, setLines] = useState<VoucherLine[]>([
    {
      id: "1",
      account: profile.accounts.receivable.number,
      accountName: profile.accounts.receivable.name,
      debitMinor: 1_250_000,
      creditMinor: 0,
    },
    {
      id: "2",
      account: profile.accounts.revenue.number,
      accountName: profile.accounts.revenue.name,
      debitMinor: 0,
      creditMinor: 1_000_000,
    },
    {
      id: "3",
      account: profile.accounts.taxPayable.number,
      accountName: profile.accounts.taxPayable.name,
      debitMinor: 0,
      creditMinor: 250_000,
    },
  ]);
  return <VoucherComposer lines={lines} onLinesChange={setLines} aria-label="Voucher lines" />;
}

function BankAccountPreview() {
  const { country } = useBookiLocale();
  const [kontonummer, setKontonummer] = useState("86011117947");
  const [routingNumber, setRoutingNumber] = useState("021000021");
  const [accountNumber, setAccountNumber] = useState("123456789");

  return (
    <BankAccountInput
      kontonummer={country === "NO" ? kontonummer : undefined}
      routingNumber={country === "US" ? routingNumber : undefined}
      accountNumber={country === "US" ? accountNumber : undefined}
      onValueChange={(next) => {
        if (next.kind === "kontonummer") {
          setKontonummer(next.digits);
          return;
        }
        if (next.kind !== "routing-account") return;
        setRoutingNumber(next.routingNumber);
        setAccountNumber(next.accountNumber);
      }}
    />
  );
}

function PaymentReferencePreview() {
  const { country } = useBookiLocale();
  return <PaymentReferencePreviewInner key={country} initial={country === "NO" ? "10012342" : "INV-1001"} />;
}

function PaymentReferencePreviewInner({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <PaymentReferenceInput value={value} onValueChange={setValue} />;
}

function AccountPickerPreview({ profile }: { profile: ReturnType<typeof useBookiLocale>["profile"] }) {
  const [value, setValue] = useState(profile.accounts.revenue.number);

  return (
    <AccountPicker
      accounts={[profile.accounts.bank, profile.accounts.revenue, profile.accounts.expense]}
      value={value}
      onValueChange={setValue}
    />
  );
}

function OrganizationNumberPreview() {
  const { country } = useBookiLocale();
  const [value, setValue] = useState(country === "NO" ? "974760673" : "123456789");
  return <OrganizationNumberInput key={country} value={value} onValueChange={setValue} />;
}

function IbanPreview() {
  const [value, setValue] = useState("NO9386011117947");
  return <IbanInput value={value} onValueChange={setValue} />;
}

function FinancialDatePreview({ kind }: { kind: "invoice" | "due" | "posting" }) {
  const [value, setValue] = useState(kind === "due" ? "2026-12-15" : "2026-11-20");
  return <FinancialDateField kind={kind} value={value} onValueChange={setValue} />;
}

function InvoiceNumberPreview() {
  const [value, setValue] = useState("INV-1001");
  return <InvoiceNumberInput value={value} onValueChange={setValue} />;
}

const STATEMENT: BankLine[] = [
  { id: "b1", date: "2026-10-01", description: "Nordlys AS", amountMinor: 1_250_000, reference: "10012342" },
  {
    id: "b2",
    date: "2026-10-02",
    description: "Samlebetaling Brattli Entreprenør og Anlegg AS",
    amountMinor: 3_000_000,
  },
  { id: "b3", date: "2026-10-03", description: "Husleie oktober", amountMinor: -1_500_000 },
  { id: "b4", date: "2026-10-04", description: "Mobilbetaling 48213", amountMinor: 49_900 },
  { id: "b5", date: "2026-10-04", description: "Mobilbetaling 48219", amountMinor: 49_900 },
];

const OPEN_POSTS: OpenPost[] = [
  { id: "p1", date: "2026-09-20", description: "Faktura 1001", amountMinor: 1_250_000, reference: "10012342" },
  { id: "p2", date: "2026-09-21", description: "Faktura 1002", amountMinor: 1_000_000 },
  { id: "p3", date: "2026-09-22", description: "Faktura 1003", amountMinor: 2_000_000 },
  { id: "p4", date: "2026-09-25", description: "Leverandørfaktura husleie", amountMinor: -1_500_000 },
  { id: "p5", date: "2026-09-28", description: "Faktura 1004", amountMinor: 49_900 },
  { id: "p6", date: "2026-09-29", description: "Faktura 1005", amountMinor: 49_900 },
];

/** Starts with the two matches a rule can make safely; the rest need judgment. */
function BankReconciliationPreview() {
  return (
    <BankReconciliation
      bankLines={STATEMENT}
      openPosts={OPEN_POSTS}
      defaultMatches={suggestMatches(STATEMENT, OPEN_POSTS)}
    />
  );
}
