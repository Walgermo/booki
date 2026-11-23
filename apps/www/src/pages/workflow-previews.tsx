import {
  ApprovalChain,
  CloseChecklist,
  InvoiceEditor,
  PaymentBatch,
  PeriodLock,
  type ApprovalLevel,
  type ApprovalRequest,
  type CloseTask,
  type Invoice,
  type PaymentBatchData,
} from "@booki/react";
import { useState, type ReactNode } from "react";

import { useLang } from "@/lib/lang";

const PEOPLE: Record<string, string> = {
  nina: "Nina (accountant)",
  kari: "Kari (manager)",
  per: "Per (manager)",
  cfo: "Astrid (CFO)",
};
const nameOf = (id: string) => PEOPLE[id]?.split(" ")[0] ?? (id === "agent" ? "the agent" : id);

/** The controls record decisions as a person's, so the preview needs to know who is at the keyboard. */
function AsPerson({ initial, children }: { initial: string; children: (actor: string) => ReactNode }) {
  const [actor, setActor] = useState(initial);
  const { t } = useLang();
  return (
    <div className="grid gap-5">
      <label className="site-label flex flex-wrap items-center gap-3">
        {t("Signed in as", "Innlogget som")}
        {/* Who is signed in is the person's to choose: an agent never switches identity. */}
        <select
          data-agent-hidden=""
          className="h-10 rounded-[6px] border border-input bg-card px-3 text-sm text-foreground"
          value={actor}
          onChange={(event) => setActor(event.target.value)}
        >
          {Object.entries(PEOPLE).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {children(actor)}
    </div>
  );
}

const CHAIN: ApprovalLevel[] = [
  {
    id: "manager",
    name: "Manager",
    approvers: [{ id: "kari", limitMinor: 20_000_000, substituteId: "per" }],
    escalateTo: { id: "cfo" },
  },
  { id: "cfo", name: "CFO", fromMinor: 10_000_000, approvers: [{ id: "cfo" }] },
];
const REQUEST: ApprovalRequest = { id: "inv-2041", amountMinor: 12_500_000, requesterId: "nina", decisions: [] };

export function ApprovalChainPreview() {
  return (
    <AsPerson initial="kari">
      {(actor) => <ApprovalChain chain={CHAIN} defaultRequest={REQUEST} actor={actor} nameOf={nameOf} />}
    </AsPerson>
  );
}

export function PeriodLockPreview() {
  return (
    <PeriodLock
      codes={["2025", "2026-01", "2026-02", "2026-03"]}
      defaultPeriods={[
        { code: "2025", status: "hard-closed" },
        { code: "2026-01", status: "soft-closed" },
      ]}
    />
  );
}

const TASKS: CloseTask[] = [
  { id: "bank", title: "Reconcile the bank", status: "open", needsSignOff: true },
  { id: "accruals", title: "Post accruals", status: "open" },
  { id: "vat", title: "Prepare the VAT return", status: "open", dependsOn: ["bank", "accruals"], needsSignOff: true },
  { id: "lock", title: "Close the period", status: "open", dependsOn: ["vat"] },
];

export function CloseChecklistPreview() {
  return (
    <AsPerson initial="nina">
      {(actor) => <CloseChecklist defaultTasks={TASKS} actor={actor} nameOf={nameOf} />}
    </AsPerson>
  );
}

export function InvoiceEditorPreview({ currency }: { currency: string }) {
  const draft: Invoice = {
    id: "draft-1",
    kind: "invoice",
    status: "draft",
    currency,
    lines: [
      {
        id: "l1",
        description: "Consulting, October",
        quantityMilli: 12_500,
        unitPriceMinor: 145_000,
        taxCategory: "S",
        taxRateBp: 2500,
      },
      {
        id: "l2",
        description: "Travel",
        quantityMilli: 1000,
        unitPriceMinor: 238_000,
        discountBp: 1000,
        taxCategory: "S",
        taxRateBp: 2500,
      },
    ],
  };
  return <InvoiceEditor defaultInvoice={draft} nextNumber="10042" />;
}

export function PaymentBatchPreview({ currency }: { currency: string }) {
  const batch: PaymentBatchData = {
    id: "batch-7",
    status: "draft",
    debitAccount: "1503 40 12345",
    valueDate: "2026-02-02",
    currency,
    preparedBy: "nina",
    approvals: [],
    items: [
      {
        id: "p1",
        creditorName: "Nordlys Kontor AS",
        amountMinor: 1_250_000,
        creditorAccount: "8601 11 17947",
        reference: "10012342",
      },
      {
        id: "p2",
        creditorName: "Brattli",
        amountMinor: 438_000,
        creditorAccount: "1234 56 78903",
        reference: "20045519",
      },
      {
        id: "p3",
        creditorName: "Nordlys Kontor AS",
        amountMinor: 1_250_000,
        creditorAccount: "86011117947",
        reference: "10012342",
      },
    ],
  };
  return (
    <AsPerson initial="kari">{(actor) => <PaymentBatch defaultBatch={batch} actor={actor} nameOf={nameOf} />}</AsPerson>
  );
}
