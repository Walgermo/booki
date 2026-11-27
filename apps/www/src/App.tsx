import { useLang } from "./lib/lang";
import { Component, lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";

import { ANNOUNCEMENT_PATH, MarketingShell } from "./components/marketing-shell";
import { LandingPage } from "./pages/landing";

/**
 * A page loaded when it is first opened: the docs, the demo and the agent
 * benchmark fixtures stay out of the landing page's bundle.
 */
function page<Name extends string>(load: () => Promise<Record<Name, ComponentType>>, name: Name) {
  return lazy(() => load().then((module) => ({ default: module[name] })));
}

const AnnouncementPage = page(() => import("./pages/announcement"), "AnnouncementPage");
const ClosePage = page(() => import("./pages/close"), "ClosePage");
const ErpTeamsPage = page(() => import("./pages/erp-teams"), "ErpTeamsPage");
const FeaturesPage = page(() => import("./pages/features"), "FeaturesPage");
const ExamplesPage = page(() => import("./pages/examples"), "ExamplesPage");
const IconsPage = page(() => import("./pages/icons"), "IconsPage");
const ComponentDocPage = page(() => import("./pages/component-doc"), "ComponentDocPage");
const ErpPage = page(() => import("./pages/erp"), "ErpPage");
const FirstActionPage = page(() => import("./pages/first-action"), "FirstActionPage");
const InstallationPage = page(() => import("./pages/installation"), "InstallationPage");
const IntroductionPage = page(() => import("./pages/introduction"), "IntroductionPage");
const DocsShell = page(() => import("./components/docs-shell"), "DocsShell");
const BenchPublicPage = page(() => import("./pages/bench-public"), "BenchPublicPage");
const BenchAccPage = page(() => import("./pages/bench"), "BenchAccPage");
const BenchCloseAccPage = page(() => import("./pages/bench"), "BenchCloseAccPage");
const BenchCloseRawPage = page(() => import("./pages/bench"), "BenchCloseRawPage");
const BenchClosedPeriodAccPage = page(() => import("./pages/bench"), "BenchClosedPeriodAccPage");
const BenchClosedPeriodRawPage = page(() => import("./pages/bench"), "BenchClosedPeriodRawPage");
const BenchDocErrorAccPage = page(() => import("./pages/bench"), "BenchDocErrorAccPage");
const BenchDocErrorRawPage = page(() => import("./pages/bench"), "BenchDocErrorRawPage");
const BenchDuplicateAccPage = page(() => import("./pages/bench"), "BenchDuplicateAccPage");
const BenchDuplicateRawPage = page(() => import("./pages/bench"), "BenchDuplicateRawPage");
const BenchForeignAccPage = page(() => import("./pages/bench"), "BenchForeignAccPage");
const BenchForeignRawPage = page(() => import("./pages/bench"), "BenchForeignRawPage");
const BenchInboxAccPage = page(() => import("./pages/bench"), "BenchInboxAccPage");
const BenchPartialVatAccPage = page(() => import("./pages/bench"), "BenchPartialVatAccPage");
const BenchPartialVatRawPage = page(() => import("./pages/bench"), "BenchPartialVatRawPage");
const BenchInboxRawPage = page(() => import("./pages/bench"), "BenchInboxRawPage");
const BenchReconcileAccPage = page(() => import("./pages/bench"), "BenchReconcileAccPage");
const BenchReconcileRawPage = page(() => import("./pages/bench"), "BenchReconcileRawPage");
const BenchDashboardAccPage = page(() => import("./pages/bench"), "BenchDashboardAccPage");
const BenchDashboardGridPage = page(() => import("./pages/bench"), "BenchDashboardGridPage");
const BenchDashboardRawPage = page(() => import("./pages/bench"), "BenchDashboardRawPage");
const BenchSalesInvoiceAccPage = page(() => import("./pages/bench"), "BenchSalesInvoiceAccPage");
const BenchSalesInvoiceRawPage = page(() => import("./pages/bench"), "BenchSalesInvoiceRawPage");
const BenchSemanticPage = page(() => import("./pages/bench"), "BenchSemanticPage");
const BenchSupplierInvoiceAccPage = page(() => import("./pages/bench"), "BenchSupplierInvoiceAccPage");
const BenchSupplierInvoiceRawPage = page(() => import("./pages/bench"), "BenchSupplierInvoiceRawPage");
const BenchVoucherAccPage = page(() => import("./pages/bench"), "BenchVoucherAccPage");
const BenchVoucherGridPage = page(() => import("./pages/bench"), "BenchVoucherGridPage");
const BenchVoucherRawPage = page(() => import("./pages/bench"), "BenchVoucherRawPage");

class PageBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function App() {
  const { t } = useLang();
  const { pathname, search, hash } = useLocation();
  return (
    <PageBoundary
      fallback={
        <main className="mx-auto max-w-prose p-8">
          <h1>{t("This page couldn’t load", "Kunne ikke laste siden")}</h1>
          <a className="site-link" href={pathname + search + hash}>
            {t("Reload this page", "Last inn siden på nytt")}
          </a>
        </main>
      }
    >
      <Suspense
        fallback={
          <p className="p-6" role="status">
            {t("Loading…", "Laster…")}
          </p>
        }
      >
        <Routes>
          <Route element={<MarketingShell />}>
            <Route index element={<LandingPage />} />
            <Route path="close" element={<ClosePage />} />
            <Route path="erp-teams" element={<ErpTeamsPage />} />
            <Route path={ANNOUNCEMENT_PATH.slice(1)} element={<AnnouncementPage />} />
            <Route path="features" element={<FeaturesPage />} />
          </Route>
          <Route path="demo" element={<ErpPage />} />
          <Route path="bench/public/:task/:side" element={<BenchPublicPage />} />
          <Route path="bench/semantic" element={<BenchSemanticPage />} />
          <Route path="bench/acc" element={<BenchAccPage />} />
          <Route path="bench/voucher-raw" element={<BenchVoucherRawPage />} />
          <Route path="bench/voucher-acc" element={<BenchVoucherAccPage />} />
          <Route path="bench/voucher-grid" element={<BenchVoucherGridPage />} />
          <Route path="bench/supplier-invoice-raw" element={<BenchSupplierInvoiceRawPage />} />
          <Route path="bench/supplier-invoice-acc" element={<BenchSupplierInvoiceAccPage />} />
          <Route path="bench/sales-invoice-raw" element={<BenchSalesInvoiceRawPage />} />
          <Route path="bench/sales-invoice-acc" element={<BenchSalesInvoiceAccPage />} />
          <Route path="bench/dashboard-raw" element={<BenchDashboardRawPage />} />
          <Route path="bench/dashboard-grid" element={<BenchDashboardGridPage />} />
          <Route path="bench/dashboard-acc" element={<BenchDashboardAccPage />} />
          <Route path="bench/inbox-raw" element={<BenchInboxRawPage />} />
          <Route path="bench/inbox-acc" element={<BenchInboxAccPage />} />
          <Route path="bench/reconcile-raw" element={<BenchReconcileRawPage />} />
          <Route path="bench/reconcile-acc" element={<BenchReconcileAccPage />} />
          <Route path="bench/close-raw" element={<BenchCloseRawPage />} />
          <Route path="bench/close-acc" element={<BenchCloseAccPage />} />
          <Route path="bench/closed-period-raw" element={<BenchClosedPeriodRawPage />} />
          <Route path="bench/closed-period-acc" element={<BenchClosedPeriodAccPage />} />
          <Route path="bench/foreign-currency-raw" element={<BenchForeignRawPage />} />
          <Route path="bench/foreign-currency-acc" element={<BenchForeignAccPage />} />
          <Route path="bench/partial-vat-raw" element={<BenchPartialVatRawPage />} />
          <Route path="bench/partial-vat-acc" element={<BenchPartialVatAccPage />} />
          <Route path="bench/doc-error-raw" element={<BenchDocErrorRawPage />} />
          <Route path="bench/doc-error-acc" element={<BenchDocErrorAccPage />} />
          <Route path="bench/duplicate-raw" element={<BenchDuplicateRawPage />} />
          <Route path="bench/duplicate-acc" element={<BenchDuplicateAccPage />} />
          <Route path="docs" element={<DocsShell />}>
            <Route index element={<IntroductionPage />} />
            <Route path="first-action" element={<FirstActionPage />} />
            <Route path="installation" element={<InstallationPage />} />
            <Route path="examples" element={<ExamplesPage />} />
            <Route path="icons" element={<IconsPage />} />
            <Route path="demo" element={<Navigate to="/demo" replace />} />
            <Route path="month-end" element={<Navigate to="/close" replace />} />
            <Route path="erp-teams" element={<Navigate to="/erp-teams" replace />} />
            <Route path=":name" element={<ComponentDocPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </PageBoundary>
  );
}
