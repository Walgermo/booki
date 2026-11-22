import { BookiError, msg } from "./msg.js";
import { isIsoDate } from "./iso-date.js";
import { periodBounds } from "./period.js";

/**
 * One box of a VAT return.
 * - `base`: the sum of `baseMinor` of the transactions whose VAT code is in `codes`.
 * - `tax`: the sum of `taxMinor` of those transactions.
 * - `total`: the sum of the boxes named in `formula`.
 * The sum is multiplied by `sign`, so input VAT can count against output VAT.
 */
export type VatReturnBox = {
  id: string;
  label: string;
  kind: "base" | "tax" | "total";
  /** VAT codes that feed the box. Empty for a `total` box. */
  codes: string[];
  sign: 1 | -1;
  /** For a `total` box: the ids of the boxes it adds up. */
  formula?: string[];
};

/** The boxes of a return for one country. Supplied as data by the app: this library holds no filing format. */
export type VatReturnSchema = {
  country: string;
  boxes: VatReturnBox[];
};

/** One voucher's VAT. Amounts are minor units; a credit note is negative. */
export type VatTransaction = {
  voucherId: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  vatCode: string;
  baseMinor: number;
  taxMinor: number;
};

/** A transaction as it counts in one box. */
export type VatBoxVoucher = VatTransaction & {
  /** What it adds to the box, sign applied. */
  amountMinor: number;
};

export type VatBoxResult = {
  id: string;
  label: string;
  kind: VatReturnBox["kind"];
  amountMinor: number;
  /** The transactions behind the amount. Empty for a `total` box. */
  vouchers: VatBoxVoucher[];
};

export type VatReturnComputation = {
  country: string;
  /** The period code, e.g. `2026-T2`. */
  period: string;
  from: string;
  to: string;
  boxes: VatBoxResult[];
  /** Transactions in the period whose VAT code no box lists. They block readiness. */
  unmapped: VatTransaction[];
  /** The sum of every `tax` box. Above zero is VAT to pay; below zero is VAT to get back. */
  payableMinor: number;
  direction: "payable" | "refundable" | "zero";
  /** How many transactions fall in the period. */
  transactionCount: number;
};

export type VatReturnStatus = "draft" | "ready" | "submitted";

/**
 * Where a return stands.
 * - `draft`: figures may still move.
 * - `ready`: a person has looked the figures over.
 * - `submitted`: a person has sent it. Fixed.
 */
export type VatReturnFiling = {
  status: VatReturnStatus;
  readyBy?: string;
  /** ISO timestamp. */
  readyAt?: string;
  submittedBy?: string;
  submittedAt?: string;
};

export const DRAFT_VAT_FILING: VatReturnFiling = { status: "draft" };

/** Everything wrong with a schema, as sentences. Empty when it can be used. */
export function vatSchemaIssues(schema: VatReturnSchema): string[] {
  const issues: string[] = [];
  if (!schema || !Array.isArray(schema.boxes) || schema.boxes.length === 0) {
    return [msg("vat.schema-no-boxes")];
  }
  const ids = new Set<string>();
  for (const box of schema.boxes) {
    if (ids.has(box.id)) issues.push(msg("vat.box-twice", { id: String(box.id) }));
    ids.add(box.id);
    if (box.kind !== "base" && box.kind !== "tax" && box.kind !== "total") {
      issues.push(msg("vat.box-kind", { id: String(box.id), value: String(box.kind) }));
    }
    if (box.sign !== 1 && box.sign !== -1) {
      issues.push(msg("vat.box-sign", { id: String(box.id), value: String(box.sign) }));
    }
    if (box.kind === "total") {
      if (!box.formula || box.formula.length === 0) issues.push(msg("vat.total-needs-formula", { id: String(box.id) }));
      if (box.codes.length > 0) issues.push(msg("vat.total-no-codes", { id: String(box.id) }));
    } else if (box.formula !== undefined) {
      issues.push(msg("vat.formula-not-total", { id: String(box.id) }));
    }
  }
  const byId = new Map(schema.boxes.map((box) => [box.id, box]));
  const loops = (id: string, seen: string[]): boolean => {
    if (seen.includes(id)) return true;
    return (byId.get(id)?.formula ?? []).some((next) => loops(next, [...seen, id]));
  };
  for (const box of schema.boxes) {
    for (const ref of box.formula ?? []) {
      if (!ids.has(ref))
        issues.push(msg("vat.unknown-ref", { id: String(box.id), ref: String(ref), boxes: [...ids].join(", ") }));
    }
    if (box.kind === "total" && loops(box.id, [])) issues.push(msg("vat.formula-loop", { id: String(box.id) }));
  }
  return issues;
}

/** The first and last date of a period code. Throws for anything else. */
function boundsOf(period: unknown): { code: string; from: string; to: string } {
  const bounds = typeof period === "string" ? periodBounds(period) : null;
  if (!bounds) {
    throw new BookiError("vat.period-code", { value: String(period) });
  }
  return { code: (period as string).trim(), ...bounds };
}

/**
 * Work out a return: every box with its amount and the transactions behind
 * it, the transactions no box takes, and the amount to pay or get back.
 * Changes nothing and files nothing.
 */
export function computeVatReturn(
  schema: VatReturnSchema,
  transactions: VatTransaction[],
  period: string,
): VatReturnComputation {
  const schemaIssues = vatSchemaIssues(schema);
  if (schemaIssues.length > 0) throw new BookiError("vat.schema-unusable", { issues: schemaIssues });
  const { code, from, to } = boundsOf(period);

  const inPeriod: VatTransaction[] = [];
  for (const transaction of transactions) {
    if (!isIsoDate(transaction.date)) {
      throw new BookiError("vat.transaction-date", {
        voucher: String(transaction.voucherId),
        value: String(transaction.date),
      });
    }
    if (!Number.isSafeInteger(transaction.baseMinor) || !Number.isSafeInteger(transaction.taxMinor)) {
      throw new BookiError("vat.transaction-amounts", {
        voucher: String(transaction.voucherId),
        base: String(transaction.baseMinor),
        tax: String(transaction.taxMinor),
      });
    }
    if (transaction.date >= from && transaction.date <= to) inPeriod.push(transaction);
  }
  inPeriod.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.voucherId < b.voucherId ? -1 : a.voucherId > b.voucherId ? 1 : 0,
  );

  const mapped = new Set<string>();
  for (const box of schema.boxes) for (const vatCode of box.codes) mapped.add(vatCode);

  const results = new Map<string, VatBoxResult>();
  for (const box of schema.boxes) {
    if (box.kind === "total") continue;
    const codes = new Set(box.codes);
    const vouchers: VatBoxVoucher[] = [];
    let amountMinor = 0;
    for (const transaction of inPeriod) {
      if (!codes.has(transaction.vatCode)) continue;
      const amount = box.sign * (box.kind === "base" ? transaction.baseMinor : transaction.taxMinor);
      amountMinor += amount;
      vouchers.push({ ...transaction, amountMinor: amount });
    }
    results.set(box.id, { id: box.id, label: box.label, kind: box.kind, amountMinor, vouchers });
  }
  const byId = new Map(schema.boxes.map((box) => [box.id, box]));
  const total = (id: string): number => {
    const done = results.get(id);
    if (done) return done.amountMinor;
    const box = byId.get(id)!;
    const amountMinor = box.sign * (box.formula ?? []).reduce((sum, ref) => sum + total(ref), 0) || 0;
    results.set(id, { id: box.id, label: box.label, kind: box.kind, amountMinor, vouchers: [] });
    return amountMinor;
  };
  for (const box of schema.boxes) total(box.id);

  const boxes = schema.boxes.map((box) => results.get(box.id)!);
  const payableMinor = boxes.filter((box) => box.kind === "tax").reduce((sum, box) => sum + box.amountMinor, 0);
  return {
    country: schema.country,
    period: code,
    from,
    to,
    boxes,
    unmapped: inPeriod.filter((transaction) => !mapped.has(transaction.vatCode)),
    payableMinor,
    direction: payableMinor > 0 ? "payable" : payableMinor < 0 ? "refundable" : "zero",
    transactionCount: inPeriod.length,
  };
}

/** The transactions behind one box. Throws for an unknown box, naming the boxes. */
export function vatBoxVouchers(computation: VatReturnComputation, boxId: string): VatBoxVoucher[] {
  const box = computation.boxes.find((item) => item.id === String(boxId));
  if (!box) {
    throw new BookiError("vat.no-box", {
      id: String(boxId),
      boxes: computation.boxes.map((item) => item.id).join(", "),
    });
  }
  return box.vouchers;
}

/** Everything that stops the return from being marked ready, as sentences. */
export function vatReturnIssues(computation: VatReturnComputation): string[] {
  if (computation.unmapped.length === 0) return [];
  const codes = [...new Set(computation.unmapped.map((transaction) => transaction.vatCode))].sort();
  const vouchers = [...new Set(computation.unmapped.map((transaction) => transaction.voucherId))];
  const listed =
    vouchers.length > 10
      ? msg("word.and-more", { list: vouchers.slice(0, 10).join(", "), count: vouchers.length - 10 })
      : vouchers.join(", ");
  return [
    msg("vat.unmapped", {
      count: computation.unmapped.length,
      period: computation.period,
      codes: codes.map((vatCode) => `"${vatCode}"`).join(", "),
      vouchers: listed,
    }),
  ];
}

/** Throws while something blocks the return. */
export function assertVatReturnReady(computation: VatReturnComputation): void {
  const issues = vatReturnIssues(computation);
  if (issues.length > 0) throw new BookiError("vat.not-ready", { period: computation.period, issues });
}

function person(actor: unknown, doing: string): string {
  const who = String(actor ?? "").trim();
  if (who === "") throw new BookiError("vat.actor-required", { doing });
  return who;
}

/** A person has checked the figures: draft becomes ready. */
export function markVatReturnReady(
  filing: VatReturnFiling,
  computation: VatReturnComputation,
  actor: string,
  at: string,
): VatReturnFiling {
  if (filing.status !== "draft") {
    throw new BookiError("vat.not-draft", { period: computation.period, status: filing.status });
  }
  const who = person(actor, msg("vat.what.mark-ready"));
  assertVatReturnReady(computation);
  return { status: "ready", readyBy: who, readyAt: at };
}

/**
 * A person sends the return: ready becomes submitted, and stays so. With
 * `requireSecondPerson`, whoever marked it ready cannot also submit it.
 * Only the status changes here; filing with the authority is the app's job.
 */
export function submitVatReturn(
  filing: VatReturnFiling,
  computation: VatReturnComputation,
  actor: string,
  at: string,
  options: { requireSecondPerson?: boolean } = {},
): VatReturnFiling {
  if (filing.status === "submitted") {
    throw new BookiError("vat.already-submitted", { period: computation.period });
  }
  if (filing.status !== "ready") {
    throw new BookiError("vat.still-draft", { period: computation.period });
  }
  const who = person(actor, msg("vat.what.submit"));
  assertVatReturnReady(computation);
  if (options.requireSecondPerson === true && who === filing.readyBy) {
    throw new BookiError("vat.second-person", { who });
  }
  return { ...filing, status: "submitted", submittedBy: who, submittedAt: at };
}

/**
 * An example schema for demos, shaped like a Norwegian return: sales and
 * purchases by rate, and a total. It is NOT a statement of the filing format.
 * The box numbers, labels and VAT codes are illustrative and have not been
 * checked against the official specification. Supply your own schema.
 */
export const NO_VAT_SCHEMA_EXAMPLE: VatReturnSchema = {
  country: "NO",
  boxes: [
    { id: "sales-high-base", label: "Salg, høy sats: grunnlag", kind: "base", codes: ["3"], sign: 1 },
    { id: "sales-high-tax", label: "Salg, høy sats: utgående mva", kind: "tax", codes: ["3"], sign: 1 },
    { id: "sales-mid-base", label: "Salg, middels sats: grunnlag", kind: "base", codes: ["31"], sign: 1 },
    { id: "sales-mid-tax", label: "Salg, middels sats: utgående mva", kind: "tax", codes: ["31"], sign: 1 },
    { id: "sales-exempt-base", label: "Salg uten mva: grunnlag", kind: "base", codes: ["5", "6"], sign: 1 },
    { id: "purchases-high-tax", label: "Kjøp, høy sats: inngående mva", kind: "tax", codes: ["1"], sign: -1 },
    { id: "purchases-mid-tax", label: "Kjøp, middels sats: inngående mva", kind: "tax", codes: ["11"], sign: -1 },
    {
      id: "to-pay",
      label: "Å betale (til gode når negativ)",
      kind: "total",
      codes: [],
      sign: 1,
      formula: ["sales-high-tax", "sales-mid-tax", "purchases-high-tax", "purchases-mid-tax"],
    },
  ],
};

/**
 * An example schema for demos: output VAT, input VAT and the net. It is NOT a
 * statement of any country's filing format; the codes `OUT`, `IN` and `ZERO`
 * are made up. Supply your own schema.
 */
export const GENERIC_VAT_SCHEMA_EXAMPLE: VatReturnSchema = {
  country: "GENERIC",
  boxes: [
    { id: "sales", label: "Taxable sales", kind: "base", codes: ["OUT"], sign: 1 },
    { id: "zero-rated", label: "Zero-rated sales", kind: "base", codes: ["ZERO"], sign: 1 },
    { id: "output-tax", label: "Tax on sales", kind: "tax", codes: ["OUT"], sign: 1 },
    { id: "purchases", label: "Purchases", kind: "base", codes: ["IN"], sign: 1 },
    { id: "input-tax", label: "Tax on purchases", kind: "tax", codes: ["IN"], sign: -1 },
    {
      id: "net",
      label: "Net tax (to get back when negative)",
      kind: "total",
      codes: [],
      sign: 1,
      formula: ["output-tax", "input-tax"],
    },
  ],
};
