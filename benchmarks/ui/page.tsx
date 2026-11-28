import { StrictMode, useEffect, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  BankReconciliation,
  BookiLocaleProvider,
  DataTable,
  LedgerTable,
  TrendChart,
  VoucherComposer,
  createBookiAgent,
  type DataTableColumn,
} from "@booki-aui/react";

/** Deterministic data, so every run renders the same rows. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const WORDS = [
  "Kontorrekvisita",
  "Husleie",
  "Strøm",
  "Reise",
  "Programvare",
  "Revisjon",
  "Bank",
  "Lønn",
  "Mat",
  "Telefon",
];
const date = (r: () => number) =>
  `2026-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`;

type Invoice = { id: string; number: string; supplier: string; date: string; due: string; amount: number; vat: number };
function invoices(n: number): Invoice[] {
  const r = rng(1);
  return Array.from({ length: n }, (_, i) => ({
    id: `inv-${i}`,
    number: String(100000 + i),
    supplier: `${WORDS[i % WORDS.length]} AS ${Math.floor(r() * 500)}`,
    date: date(r),
    due: date(r),
    amount: Math.floor(r() * 10_000_000),
    vat: Math.floor(r() * 2_500_000),
  }));
}
const invoiceColumns: DataTableColumn<Invoice>[] = [
  { id: "number", header: "Number", value: (row) => row.number },
  { id: "supplier", header: "Supplier", value: (row) => row.supplier },
  { id: "date", header: "Date", kind: "date", value: (row) => row.date },
  { id: "due", header: "Due", kind: "date", value: (row) => row.due },
  { id: "amount", header: "Amount", kind: "money", value: (row) => row.amount },
  { id: "vat", header: "VAT", kind: "money", value: (row) => row.vat },
];

function ledger(n: number) {
  const r = rng(2);
  const accounts = ["1920", "2400", "3000", "4000", "6300", "6800", "7140"];
  return Array.from({ length: n }, (_, i) => {
    const debit = r() < 0.5;
    const amount = Math.floor(r() * 5_000_000);
    return {
      id: `e-${i}`,
      voucherId: `v-${Math.floor(i / 2)}`,
      voucherNumber: String(1000 + Math.floor(i / 2)),
      date: date(r),
      // Most entries on the bank account the ledger opens on, so its view holds thousands of rows.
      account: i % 8 ? "1920" : accounts[i % accounts.length]!,
      accountName: WORDS[i % WORDS.length]!,
      description: `${WORDS[(i * 3) % WORDS.length]} ${i}`,
      debitMinor: debit ? amount : 0,
      creditMinor: debit ? 0 : amount,
    };
  });
}

function voucherLines(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `l-${i}`,
    account: i % 2 ? "1920" : "6300",
    accountName: i % 2 ? "Bank" : "Leie lokale",
    debitMinor: i % 2 ? 0 : 10_000 + i,
    creditMinor: i % 2 ? 10_000 + i - 1 : 0,
  }));
}

function bank(n: number) {
  const r = rng(3);
  const bankLines = Array.from({ length: n }, (_, i) => ({
    id: `b-${i}`,
    date: date(r),
    description: `${WORDS[i % WORDS.length]} ${i}`,
    amountMinor: Math.floor((r() - 0.5) * 2_000_000),
  }));
  const openPosts = bankLines.map((line, i) => ({ ...line, id: `p-${i}`, description: `Faktura ${i}` }));
  return { bankLines, openPosts };
}

function series(points: number) {
  const r = rng(4);
  return ["Revenue", "Costs", "Result"].map((name, s) => ({
    id: `s${s}`,
    name,
    points: Array.from({ length: points }, (_, i) => {
      const year = 2026 - Math.floor((points - 1 - i) / 12);
      const month = 12 - ((points - 1 - i) % 12);
      return { period: `${year}-${String(month).padStart(2, "0")}`, valueMinor: Math.floor(r() * 100_000_000) };
    }),
  }));
}

const SCENARIOS = {
  "data-table": (n: number) => {
    const rows = invoices(n);
    return (tick: number) => (
      <DataTable
        aria-label="Invoices"
        rows={tick ? rows.map((row, i) => (i === 0 ? { ...row, amount: row.amount + tick } : row)) : rows}
        columns={invoiceColumns}
        pageSize={100}
        selectable
      />
    );
  },
  "ledger-table": (n: number) => {
    const entries = ledger(n);
    return (tick: number) => (
      <LedgerTable
        aria-label="Ledger"
        entries={tick ? entries.map((e, i) => (i === 0 ? { ...e, description: `x${tick}` } : e)) : entries}
        defaultAccount="1920"
        pageSize={100}
      />
    );
  },
  "voucher-composer": (n: number) => {
    const lines = voucherLines(n);
    return (tick: number) => (
      <VoucherComposer aria-label="Voucher" defaultLines={lines} editable key={tick ? undefined : 0} />
    );
  },
  "bank-reconciliation": (n: number) => {
    const data = bank(n);
    return (_tick: number) => <BankReconciliation aria-label="Bank" {...data} />;
  },
  "trend-chart": (n: number) => {
    const data = series(n);
    return (_tick: number) => <TrendChart aria-label="Trend" title="Trend" series={data} defaultRange="all" />;
  },
} as const;

let root: Root | null = null;
let rerender: ((tick: number) => void) | null = null;
const agent = createBookiAgent({ agentId: "bench" });

/**
 * Settle: let React flush what the step scheduled (a macrotask after its
 * microtasks), then force style and layout, so the time covers the work up to
 * a page ready to paint, without waiting for the next frame.
 */
const frame = async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  document.body.getBoundingClientRect();
};

function Host({ view }: { view: (tick: number) => ReactElement }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    rerender = setTick;
  }, []);
  return (
    <StrictMode>
      <BookiLocaleProvider defaultCountry="NO">{view(tick)}</BookiLocaleProvider>
    </StrictMode>
  );
}

const bench = {
  async mount(name: keyof typeof SCENARIOS, n: number) {
    const host = document.getElementById("app")!;
    root?.unmount();
    host.textContent = "";
    const view = SCENARIOS[name](n);
    await frame();
    const t0 = performance.now();
    root = createRoot(host);
    flushSync(() => root!.render(<Host view={view} />));
    await frame();
    return performance.now() - t0;
  },
  /** The parent renders again with one row changed. */
  async rerender(tick: number) {
    const t0 = performance.now();
    flushSync(() => rerender!(tick));
    await frame();
    return performance.now() - t0;
  },
  /** A person types one character into the first search box. */
  async type(text: string) {
    const input = document.querySelector<HTMLInputElement>(
      'input[type="search"], [data-slot$="search"] input, input[placeholder="Søk"]',
    )!;
    const t0 = performance.now();
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await frame();
    return performance.now() - t0;
  },
  /** A person clicks the n-th sort button. */
  async sort(index: number) {
    const button = document.querySelectorAll<HTMLButtonElement>('[data-slot$="-sort"], [data-slot="data-table-sort"]')[
      index
    ]!;
    const t0 = performance.now();
    button.click();
    await frame();
    return performance.now() - t0;
  },
  /** The agent runs one step through the bridge. */
  async act(ref: string, action: string, args: unknown[]) {
    const t0 = performance.now();
    const result = await agent.act({ steps: [{ ref, action, args }] });
    await frame();
    const ms = performance.now() - t0;
    // A refused step would time the refusal, not the work.
    if (!(result as { ok?: boolean }).ok) throw new Error(JSON.stringify(result).slice(0, 400));
    return ms;
  },
  async snapshot() {
    const t0 = performance.now();
    await agent.snapshot();
    return performance.now() - t0;
  },
};
(window as unknown as { bench: typeof bench }).bench = bench;
document.title = "ready";
