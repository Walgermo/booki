/**
 * The tasks the API side runs, and how each one is checked. The task text and
 * the system prompt are the screen runs' own (tasks.ts); only the tools differ.
 *
 * - supplier-invoice: the end state the API holds, by the API verifier.
 * - dashboard: the model's answer, by the same check as the dashboard pages,
 *   and nothing may have been written (the task says "Ikke endre noe").
 *
 * The voucher and sales-invoice runs on the screens are withdrawn (RUNS.md);
 * their API verifiers exist (api/verify.ts) and can be added here once the
 * screens are measured again.
 */
import type { LedgerState } from "./api/ledger.js";
import { verifySupplierInvoiceApi } from "./api/verify.js";
import type { TaskId } from "./tasks.js";
import { verdict, verifyDashboardAnswer, type Verification } from "./verify.js";

export type ApiTask = {
  /** The page id in the results file and in bench.json: "<task>-api". */
  page: string;
  verify: (state: LedgerState, answer: string) => Promise<Verification>;
};

const nothingWritten = (state: LedgerState) =>
  state.vouchers.length === 0 &&
  state.supplierInvoices.length === 0 &&
  state.salesInvoices.length === 0 &&
  state.audit.length === 0;

export const API_TASKS: Partial<Record<TaskId, ApiTask>> = {
  "supplier-invoice": {
    page: "supplier-invoice-api",
    verify: async (state) => verifySupplierInvoiceApi(state),
  },
  dashboard: {
    page: "dashboard-api",
    verify: async (state, answer) => {
      // The session argument is unused by the answer check.
      const read = await verifyDashboardAnswer(undefined as never, { answer });
      return verdict({ ...read.checks, nothingWritten: nothingWritten(state) }, false, { answer, state });
    },
  },
};
