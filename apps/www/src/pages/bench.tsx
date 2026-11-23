import { BookiLocaleProvider } from "@booki/react";
import { useEffect, useRef } from "react";

import { BookiClose } from "@/components/bench/acc-close";
import { BookiClosedPeriod } from "@/components/bench/closed-period-acc";
import { ClosedPeriodRaw } from "@/components/bench/closed-period-raw";
import { BookiPartialVat } from "@/components/bench/partial-vat-acc";
import { PartialVatRaw } from "@/components/bench/partial-vat-raw";
import { BookiDashboard } from "@/components/bench/acc-dashboard";
import { BookiInbox } from "@/components/bench/acc-inbox";
import { BookiReconcile } from "@/components/bench/acc-reconcile";
import { BookiSalesInvoice } from "@/components/bench/acc-sales-invoice";
import { BookiSupplierInvoice } from "@/components/bench/acc-supplier-invoice";
import { BookiVoucher } from "@/components/bench/acc-voucher";
import { CloseRaw } from "@/components/bench/close-raw";
import { BookiDocError } from "@/components/bench/doc-error-acc";
import { DocErrorRaw } from "@/components/bench/doc-error-raw";
import { BookiForeign } from "@/components/bench/foreign-currency-acc";
import { ForeignRaw } from "@/components/bench/foreign-currency-raw";
import { BookiDuplicate } from "@/components/bench/duplicate-acc";
import { DuplicateRaw } from "@/components/bench/duplicate-raw";
import { DashboardGrid } from "@/components/bench/dashboard-grid";
import { DashboardRaw } from "@/components/bench/dashboard-raw";
import { GridVoucher } from "@/components/bench/grid-voucher";
import { InboxRaw } from "@/components/bench/inbox-raw";
import { RawVoucher } from "@/components/bench/raw-voucher";
import { ReconcileRaw } from "@/components/bench/reconcile-raw";
import { SalesInvoiceRaw } from "@/components/bench/sales-invoice-raw";
import { SupplierInvoiceRaw } from "@/components/bench/supplier-invoice-raw";
import { BookiInvoice } from "@/components/landing/acc-invoice";
import { SemanticInvoice } from "@/components/landing/semantic-invoice";

/**
 * The same neutral tab title on every page of a task: browser tools report the
 * title to the model, and the site's own title would name Booki on every page.
 */
function useBenchTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/**
 * Bare pages for the benchmark in /benchmarks/agent: the same invoice as plain
 * HTML and as Booki, with nothing else on the page. Not linked from the site.
 */
export function BenchSemanticPage() {
  const formRef = useRef<HTMLFormElement | null>(null);
  useBenchTitle("Invoice");
  return (
    <main className="landing-form mx-auto max-w-xl p-6">
      <h1 className="mt-0 text-xl font-semibold">Invoice</h1>
      <SemanticInvoice formRef={formRef} />
    </main>
  );
}

export function BenchAccPage() {
  useBenchTitle("Invoice");
  return (
    <main className="landing-form mx-auto max-w-xl p-6">
      <h1 className="mt-0 text-xl font-semibold">Invoice</h1>
      {/* US profile, like the landing page: the task uses the 8.875% tax code. */}
      <BookiLocaleProvider country="US">
        <BookiInvoice />
      </BookiLocaleProvider>
    </main>
  );
}

/**
 * The head-to-head pair: a voucher screen built the way large ERP products
 * build it today, and the same screen on Booki. Neutral look, invented data.
 */
export function BenchVoucherRawPage() {
  useBenchTitle("Registrer bilag");
  return (
    <main lang="nb" className="mx-auto max-w-4xl p-6">
      <RawVoucher />
    </main>
  );
}

export function BenchVoucherAccPage() {
  useBenchTitle("Registrer bilag");
  return (
    <main lang="nb" className="landing-form mx-auto max-w-4xl p-6">
      <BookiLocaleProvider country="NO">
        <BookiVoucher />
      </BookiLocaleProvider>
    </main>
  );
}

/** The second head-to-head screen: voucher entry as an editable spreadsheet grid. */
export function BenchVoucherGridPage() {
  useBenchTitle("Registrer bilag");
  return (
    <main lang="nb" className="mx-auto max-w-5xl p-6">
      <GridVoucher />
    </main>
  );
}

/** Supplier invoice, detailed entry: the replica and Booki. */
export function BenchSupplierInvoiceRawPage() {
  useBenchTitle("Registrer leverandørfaktura");
  return (
    <main lang="nb" className="mx-auto max-w-5xl p-6">
      <SupplierInvoiceRaw />
    </main>
  );
}

export function BenchSupplierInvoiceAccPage() {
  useBenchTitle("Registrer leverandørfaktura");
  return (
    <main lang="nb" className="landing-form mx-auto max-w-4xl p-6">
      <BookiLocaleProvider country="NO">
        <BookiSupplierInvoice />
      </BookiLocaleProvider>
    </main>
  );
}

/** New order/invoice: the replica and Booki. */
export function BenchSalesInvoiceRawPage() {
  useBenchTitle("Ny ordre");
  return (
    <main lang="nb" className="mx-auto max-w-5xl p-6">
      <SalesInvoiceRaw />
    </main>
  );
}

export function BenchSalesInvoiceAccPage() {
  useBenchTitle("Ny ordre");
  return (
    <main lang="nb" className="landing-form mx-auto max-w-4xl p-6">
      <BookiLocaleProvider country="NO">
        <BookiSalesInvoice />
      </BookiLocaleProvider>
    </main>
  );
}

/** The read-only dashboard: two replicas and Booki, the same figures on each. */
export function BenchDashboardRawPage() {
  useBenchTitle("Oversikt");
  return (
    <main lang="nb" className="mx-auto max-w-5xl p-6">
      <DashboardRaw />
    </main>
  );
}

export function BenchDashboardGridPage() {
  useBenchTitle("Oversikt");
  return (
    <main lang="nb" className="mx-auto max-w-5xl p-6">
      <DashboardGrid />
    </main>
  );
}

export function BenchDashboardAccPage() {
  useBenchTitle("Oversikt");
  return (
    <main lang="nb" className="landing-form mx-auto max-w-5xl p-6">
      <BookiLocaleProvider country="NO">
        <BookiDashboard />
      </BookiLocaleProvider>
    </main>
  );
}

/** The workflow tasks: a month's inbox, the bank reconciliation and the close, each on a replica and on Booki. */
export function BenchInboxRawPage() {
  useBenchTitle("Leverandørfakturaer");
  return (
    <main lang="nb" className="mx-auto max-w-5xl p-6">
      <InboxRaw />
    </main>
  );
}

export function BenchInboxAccPage() {
  useBenchTitle("Leverandørfakturaer");
  return (
    <main lang="nb" className="landing-form mx-auto max-w-5xl p-6">
      <BookiLocaleProvider country="NO">
        <BookiInbox />
      </BookiLocaleProvider>
    </main>
  );
}

export function BenchReconcileRawPage() {
  useBenchTitle("Bankavstemming");
  return (
    <main lang="nb" className="mx-auto max-w-5xl p-6">
      <ReconcileRaw />
    </main>
  );
}

export function BenchReconcileAccPage() {
  useBenchTitle("Bankavstemming");
  return (
    <main lang="nb" className="landing-form mx-auto max-w-5xl p-6">
      <BookiLocaleProvider country="NO">
        <BookiReconcile />
      </BookiLocaleProvider>
    </main>
  );
}

export function BenchCloseRawPage() {
  useBenchTitle("Månedsavslutning");
  return (
    <main lang="nb" className="mx-auto max-w-5xl p-6">
      <CloseRaw />
    </main>
  );
}

export function BenchCloseAccPage() {
  useBenchTitle("Månedsavslutning");
  return (
    <main lang="nb" className="landing-form mx-auto max-w-5xl p-6">
      <BookiLocaleProvider country="NO">
        <BookiClose />
      </BookiLocaleProvider>
    </main>
  );
}

/** Document error: the printed total does not add up to the lines and the VAT. */
export function BenchDocErrorRawPage() {
  useBenchTitle("Registrer leverandørfaktura");
  return (
    <main lang="nb" className="mx-auto max-w-5xl p-6">
      <DocErrorRaw />
    </main>
  );
}

export function BenchDocErrorAccPage() {
  useBenchTitle("Registrer leverandørfaktura");
  return (
    <main lang="nb" className="landing-form mx-auto max-w-4xl p-6">
      <BookiLocaleProvider country="NO">
        <BookiDocError />
      </BookiLocaleProvider>
    </main>
  );
}

/** Duplicate: the invoice is already in the ledger. */
export function BenchDuplicateRawPage() {
  useBenchTitle("Registrer leverandørfaktura");
  return (
    <main lang="nb" className="mx-auto max-w-5xl p-6">
      <DuplicateRaw />
    </main>
  );
}

export function BenchDuplicateAccPage() {
  useBenchTitle("Registrer leverandørfaktura");
  return (
    <main lang="nb" className="landing-form mx-auto max-w-4xl p-6">
      <BookiLocaleProvider country="NO">
        <BookiDuplicate />
      </BookiLocaleProvider>
    </main>
  );
}

/** Closed period: a voucher dated in a locked period is refused on the plain page, and the agent posts in October. */
export function BenchClosedPeriodRawPage() {
  useBenchTitle("Registrer bilag");
  return (
    <main lang="nb" className="mx-auto max-w-5xl p-6">
      <ClosedPeriodRaw />
    </main>
  );
}

export function BenchClosedPeriodAccPage() {
  useBenchTitle("Registrer bilag");
  return (
    <main lang="nb" className="landing-form mx-auto max-w-4xl p-6">
      <BookiLocaleProvider country="NO">
        <BookiClosedPeriod />
      </BookiLocaleProvider>
    </main>
  );
}

/** Partial VAT: the phone bill is half private, so the plain form has no VAT code and no split. */
export function BenchPartialVatRawPage() {
  useBenchTitle("Registrer bilag");
  return (
    <main lang="nb" className="mx-auto max-w-5xl p-6">
      <PartialVatRaw />
    </main>
  );
}

export function BenchPartialVatAccPage() {
  useBenchTitle("Registrer bilag");
  return (
    <main lang="nb" className="landing-form mx-auto max-w-4xl p-6">
      <BookiLocaleProvider country="NO">
        <BookiPartialVat />
      </BookiLocaleProvider>
    </main>
  );
}

/** Foreign currency: an EUR invoice booked in NOK at the rate of its date. The plain form has no conversion. */
export function BenchForeignRawPage() {
  useBenchTitle("Registrer bilag");
  return (
    <main lang="nb" className="mx-auto max-w-5xl p-6">
      <ForeignRaw />
    </main>
  );
}

export function BenchForeignAccPage() {
  useBenchTitle("Registrer bilag");
  return (
    <main lang="nb" className="landing-form mx-auto max-w-4xl p-6">
      <BookiLocaleProvider country="NO">
        <BookiForeign />
      </BookiLocaleProvider>
    </main>
  );
}
