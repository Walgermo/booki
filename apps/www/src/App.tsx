import { lazy, Suspense, type ComponentType } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

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
const ComponentDocPage = page(() => import("./pages/component-doc"), "ComponentDocPage");
const ErpPage = page(() => import("./pages/erp"), "ErpPage");
const InstallationPage = page(() => import("./pages/installation"), "InstallationPage");
const IntroductionPage = page(() => import("./pages/introduction"), "IntroductionPage");
const DocsShell = page(() => import("./components/docs-shell"), "DocsShell");
const BenchAccPage = page(() => import("./pages/bench"), "BenchAccPage");
const BenchCloseAccPage = page(() => import("./pages/bench"), "BenchCloseAccPage");
const BenchCloseRawPage = page(() => import("./pages/bench"), "BenchCloseRawPage");
const BenchDocErrorAccPage = page(() => import("./pages/bench"), "BenchDocErrorAccPage");
const BenchDocErrorRawPage = page(() => import("./pages/bench"), "BenchDocErrorRawPage");
const BenchDuplicateAccPage = page(() => import("./pages/bench"), "BenchDuplicateAccPage");
const BenchDuplicateRawPage = page(() => import("./pages/bench"), "BenchDuplicateRawPage");
const BenchInboxAccPage = page(() => import("./pages/bench"), "BenchInboxAccPage");
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

export function App() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route element={<MarketingShell />}>
          <Route index element={<LandingPage />} />
          <Route path="close" element={<ClosePage />} />
          <Route path="erp-teams" element={<ErpTeamsPage />} />
          <Route path={ANNOUNCEMENT_PATH.slice(1)} element={<AnnouncementPage />} />
          <Route path="features" element={<FeaturesPage />} />
        </Route>
        <Route path="demo" element={<ErpPage />} />
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
        <Route path="bench/doc-error-raw" element={<BenchDocErrorRawPage />} />
        <Route path="bench/doc-error-acc" element={<BenchDocErrorAccPage />} />
        <Route path="bench/duplicate-raw" element={<BenchDuplicateRawPage />} />
        <Route path="bench/duplicate-acc" element={<BenchDuplicateAccPage />} />
        <Route path="docs" element={<DocsShell />}>
          <Route index element={<IntroductionPage />} />
          <Route path="installation" element={<InstallationPage />} />
          <Route path="examples" element={<ExamplesPage />} />
          <Route path="demo" element={<Navigate to="/demo" replace />} />
          <Route path="month-end" element={<Navigate to="/close" replace />} />
          <Route path="erp-teams" element={<Navigate to="/erp-teams" replace />} />
          <Route path=":name" element={<ComponentDocPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
