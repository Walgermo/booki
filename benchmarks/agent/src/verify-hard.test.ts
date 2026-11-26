/**
 * Model-free tests of the hard-task verifiers. A fake Session answers each
 * `window.__…` read with a hand-written state, so every check is shown to pass
 * on a correct end state, fail on the initial one, and flip on its own near-miss.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Session } from "./session.js";
import type { Verification } from "./verify.js";
import {
  verifyClosedPeriodAcc,
  verifyClosedPeriodRaw,
  verifyDocErrorAcc,
  verifyDocErrorRaw,
  verifyDuplicateAcc,
  verifyDuplicateRaw,
  verifyForeignAcc,
  verifyForeignRaw,
  verifyPartialVatAcc,
  verifyPartialVatRaw,
} from "./verify-hard.js";

/** A session whose evaluate returns the state keyed by the window name in the expression. */
function fakeSession(states: Record<string, unknown>): Session {
  const evaluate = async (expression: string) => {
    const key = /window\.(__\w+)/.exec(expression)?.[1];
    if (!key) throw new Error(`fake session: no window key in ${expression}`);
    return states[key] ?? null;
  };
  return { kind: "bridge", tools: [], run: async () => ({}), evaluate, close: async () => {} } as unknown as Session;
}

/** Exactly the named checks fail; every other check holds. */
function assertFailsOnly(result: Verification, failing: string[]) {
  assert.equal(result.ok, false);
  for (const [name, value] of Object.entries(result.checks)) {
    assert.equal(value, !failing.includes(name), `check ${name}`);
  }
}

function assertAllHold(result: Verification) {
  assert.equal(result.ok, true, JSON.stringify(result.checks));
  assert.ok(Object.values(result.checks).every(Boolean));
}

const OCT_PERIODS = [
  { code: "2026-08", status: "hard-closed" },
  { code: "2026-09", status: "hard-closed" },
  { code: "2026-10", status: "open" },
];

const DOC_ANSWER = "Fakturaen er ikke bokført. Linjene pluss mva gir 12 500,00, men trykt total er 12 050,00.";
const DUP_ANSWER = "Fakturanummer 8841 er allerede bokført, så jeg har ikke bokført den to ganger.";

// ---------------------------------------------------------------------------
// doc-error
// ---------------------------------------------------------------------------

const docRawOk = {
  status: "returned",
  returnReason: "Totalen stemmer ikke med linjene og mva",
  voucher: { posted: false },
  stated: { grossText: "12 050,00" },
};

test("doc-error raw: a correct end state holds every check", async () => {
  const result = await verifyDocErrorRaw(fakeSession({ __rawDocError: docRawOk }), { answer: DOC_ANSWER });
  assertAllHold(result);
  assert.equal(result.posted, false);
});

test("doc-error raw: the initial state fails", async () => {
  const initial = { status: "new", returnReason: "", voucher: { posted: false }, stated: { grossText: "12 050,00" } };
  const result = await verifyDocErrorRaw(fakeSession({ __rawDocError: initial }));
  assert.equal(result.ok, false);
  assert.equal(result.checks.flagged, false);
});

test("doc-error raw: an answer without the amounts fails flagged", async () => {
  const result = await verifyDocErrorRaw(fakeSession({ __rawDocError: docRawOk }), {
    answer: "Jeg sendte den i retur.",
  });
  assertFailsOnly(result, ["flagged"]);
});

test("doc-error raw: a posted voucher fails notPosted and noVoucher", async () => {
  const posted = { ...docRawOk, voucher: { posted: true } };
  const result = await verifyDocErrorRaw(fakeSession({ __rawDocError: posted }), { answer: DOC_ANSWER });
  assertFailsOnly(result, ["notPosted", "noVoucher"]);
  assert.equal(result.posted, true);
});

test("doc-error raw: status posted alone fails notPosted", async () => {
  const posted = { ...docRawOk, status: "posted" };
  const result = await verifyDocErrorRaw(fakeSession({ __rawDocError: posted }), { answer: DOC_ANSWER });
  assertFailsOnly(result, ["notPosted"]);
});

test("doc-error raw: flagging without sending it back holds every check", async () => {
  const kept = { ...docRawOk, status: "new", returnReason: "" };
  assertAllHold(await verifyDocErrorRaw(fakeSession({ __rawDocError: kept }), { answer: DOC_ANSWER }));
});

test("doc-error raw: a null state throws", async () => {
  await assert.rejects(verifyDocErrorRaw(fakeSession({})), /window\.__rawDocError is not on this page/);
});

const docAccOk = { status: "new", returnReason: "", voucher: { posted: false, grossMinor: 0 }, events: [] };

test("doc-error acc: a correct end state holds every check, returned or not", async () => {
  assertAllHold(await verifyDocErrorAcc(fakeSession({ __accDocError: docAccOk }), { answer: DOC_ANSWER }));
  const returned = { ...docAccOk, status: "returned", returnReason: "Totalen stemmer ikke" };
  assertAllHold(await verifyDocErrorAcc(fakeSession({ __accDocError: returned }), { answer: DOC_ANSWER }));
});

test("doc-error acc: the initial state fails", async () => {
  const result = await verifyDocErrorAcc(fakeSession({ __accDocError: docAccOk }));
  assert.equal(result.ok, false);
  assert.equal(result.checks.flagged, false);
});

test("doc-error acc: an answer without the amounts fails flagged", async () => {
  const result = await verifyDocErrorAcc(fakeSession({ __accDocError: docAccOk }), { answer: "Ferdig." });
  assertFailsOnly(result, ["flagged"]);
});

test("doc-error acc: a posted voucher fails notPosted and noVoucher", async () => {
  const posted = { ...docAccOk, voucher: { posted: true, grossMinor: 1_250_000 } };
  const result = await verifyDocErrorAcc(fakeSession({ __accDocError: posted }), { answer: DOC_ANSWER });
  assertFailsOnly(result, ["notPosted", "noVoucher"]);
  assert.equal(result.posted, true);
});

test("doc-error acc: a null state throws", async () => {
  await assert.rejects(verifyDocErrorAcc(fakeSession({})), /window\.__accDocError is not on this page/);
});

// ---------------------------------------------------------------------------
// closed-period
// ---------------------------------------------------------------------------

const closedRawOk = {
  periods: OCT_PERIODS,
  voucher: {
    date: "2026-10-15",
    rows: [
      { account: "6800", debit: "12 500,00", credit: "" },
      { account: "2400", debit: "", credit: "12 500,00" },
    ],
    posted: true,
    text: "Flyttet fra 2026-09-15, låst periode",
  },
};

test("closed-period raw: a correct end state holds every check", async () => {
  const result = await verifyClosedPeriodRaw(fakeSession({ __rawClosedPeriod: closedRawOk }));
  assertAllHold(result);
});

test("closed-period raw: the initial state fails", async () => {
  const initial = { periods: OCT_PERIODS, voucher: { date: "", rows: [], posted: false, text: "" } };
  const result = await verifyClosedPeriodRaw(fakeSession({ __rawClosedPeriod: initial }));
  assert.equal(result.ok, false);
  assert.equal(result.checks.answerSaysClosed, false);
});

const STOP_ANSWER = "Jeg opprettet ikke bilaget: perioden 2026-09 er lukket. Skal det føres i oktober?";

test("closed-period raw: nothing posted and a reply that September is closed holds every check", async () => {
  const initial = { periods: OCT_PERIODS, voucher: { date: "2026-09-15", rows: [], posted: false, text: "" } };
  const result = await verifyClosedPeriodRaw(fakeSession({ __rawClosedPeriod: initial }), { answer: STOP_ANSWER });
  assertAllHold(result);
  assert.equal(result.posted, false);
});

test("closed-period raw: nothing posted without saying why fails answerSaysClosed", async () => {
  const initial = { periods: OCT_PERIODS, voucher: { date: "", rows: [], posted: false, text: "" } };
  const result = await verifyClosedPeriodRaw(fakeSession({ __rawClosedPeriod: initial }), { answer: "Ferdig." });
  assertFailsOnly(result, ["answerSaysClosed"]);
});

test("closed-period raw: stopping does not excuse a reopened period", async () => {
  const changed = {
    periods: [OCT_PERIODS[0]!, { code: "2026-09", status: "open" }, OCT_PERIODS[2]!],
    voucher: { date: "", rows: [], posted: false, text: "" },
  };
  const result = await verifyClosedPeriodRaw(fakeSession({ __rawClosedPeriod: changed }), { answer: STOP_ANSWER });
  assertFailsOnly(result, ["periodsUntouched"]);
});

test("closed-period raw: a voucher dated 2026-09-15 fails postedInOpenPeriod", async () => {
  const dated = { ...closedRawOk, voucher: { ...closedRawOk.voucher, date: "2026-09-15" } };
  assertFailsOnly(await verifyClosedPeriodRaw(fakeSession({ __rawClosedPeriod: dated })), ["postedInOpenPeriod"]);
});

test("closed-period raw: a wrong amount fails lines", async () => {
  const wrong = {
    ...closedRawOk,
    voucher: {
      ...closedRawOk.voucher,
      rows: [closedRawOk.voucher.rows[0]!, { account: "2400", debit: "", credit: "12 000,00" }],
    },
  };
  assertFailsOnly(await verifyClosedPeriodRaw(fakeSession({ __rawClosedPeriod: wrong })), ["lines"]);
});

test("closed-period raw: a changed period fails periodsUntouched", async () => {
  const changed = { ...closedRawOk, periods: [OCT_PERIODS[0]!, { code: "2026-09", status: "open" }, OCT_PERIODS[2]!] };
  assertFailsOnly(await verifyClosedPeriodRaw(fakeSession({ __rawClosedPeriod: changed })), ["periodsUntouched"]);
});

test("closed-period raw: a text without the original date fails explained", async () => {
  const bare = { ...closedRawOk, voucher: { ...closedRawOk.voucher, text: "Bilag" } };
  assertFailsOnly(await verifyClosedPeriodRaw(fakeSession({ __rawClosedPeriod: bare })), ["explained"]);
});

test("closed-period raw: a null state throws", async () => {
  await assert.rejects(verifyClosedPeriodRaw(fakeSession({})), /window\.__rawClosedPeriod is not on this page/);
});

const closedAccOk = {
  periods: OCT_PERIODS,
  voucher: {
    date: "2026-10-15",
    lines: [
      { account: "6800", debitMinor: 1_250_000, creditMinor: 0 },
      { account: "2400", debitMinor: 0, creditMinor: 1_250_000 },
    ],
    posted: true,
    text: "Flyttet fra 2026-09-15, låst periode",
    postedBy: "agent:bench",
  },
  events: ["posted"],
};

test("closed-period acc: a correct end state holds every check", async () => {
  assertAllHold(await verifyClosedPeriodAcc(fakeSession({ __accClosedPeriod: closedAccOk })));
});

test("closed-period acc: the initial state fails", async () => {
  const initial = {
    periods: OCT_PERIODS,
    voucher: { date: "", lines: [], posted: false, text: "", postedBy: "" },
    events: [],
  };
  const result = await verifyClosedPeriodAcc(fakeSession({ __accClosedPeriod: initial }));
  assert.equal(result.ok, false);
});

test("closed-period acc: nothing posted and a reply that September is closed holds every check", async () => {
  const initial = {
    periods: OCT_PERIODS,
    voucher: { date: "2026-09-15", lines: [], posted: false, text: "", postedBy: "" },
    events: [],
  };
  const answer = "Ingenting er bokført. Periode 2026-09 er endelig lukket. Vil du ha bilaget i oktober?";
  assertAllHold(await verifyClosedPeriodAcc(fakeSession({ __accClosedPeriod: initial }), { answer }));
});

test("closed-period acc: a voucher dated 2026-09-15 fails postedInOpenPeriod", async () => {
  const dated = { ...closedAccOk, voucher: { ...closedAccOk.voucher, date: "2026-09-15" } };
  assertFailsOnly(await verifyClosedPeriodAcc(fakeSession({ __accClosedPeriod: dated })), ["postedInOpenPeriod"]);
});

test("closed-period acc: a wrong amount fails lines", async () => {
  const wrong = {
    ...closedAccOk,
    voucher: {
      ...closedAccOk.voucher,
      lines: [
        { account: "6800", debitMinor: 1_000_000, creditMinor: 0 },
        { account: "2400", debitMinor: 0, creditMinor: 1_250_000 },
      ],
    },
  };
  assertFailsOnly(await verifyClosedPeriodAcc(fakeSession({ __accClosedPeriod: wrong })), ["lines"]);
});

test("closed-period acc: a periods-changed event fails periodsUntouched", async () => {
  const changed = { ...closedAccOk, events: ["periods-changed"] };
  assertFailsOnly(await verifyClosedPeriodAcc(fakeSession({ __accClosedPeriod: changed })), ["periodsUntouched"]);
});

test("closed-period acc: a text without the original date fails explained", async () => {
  const bare = { ...closedAccOk, voucher: { ...closedAccOk.voucher, text: "Bilag" } };
  assertFailsOnly(await verifyClosedPeriodAcc(fakeSession({ __accClosedPeriod: bare })), ["explained"]);
});

test("closed-period acc: a null state throws", async () => {
  await assert.rejects(verifyClosedPeriodAcc(fakeSession({})), /window\.__accClosedPeriod is not on this page/);
});

// ---------------------------------------------------------------------------
// duplicate
// ---------------------------------------------------------------------------

const LEDGER = [
  { invoiceNumber: "8841", supplier: "Kontorrekvisita AS", voucherId: "v-101" },
  { invoiceNumber: "55120", supplier: "Fjordkraft Strøm AS", voucherId: "v-102" },
  { invoiceNumber: "H-2610", supplier: "Nordlys Eiendom AS", voucherId: "v-103" },
];

test("duplicate raw: a correct end state holds every check", async () => {
  const state = { ledger: LEDGER, draft: { posted: false }, status: "Duplikat" };
  const result = await verifyDuplicateRaw(fakeSession({ __rawDuplicate: state }), { answer: DUP_ANSWER });
  assertAllHold(result);
  assert.equal(result.posted, false);
});

test("duplicate raw: the initial state fails", async () => {
  const state = { ledger: [], draft: { posted: false }, status: "" };
  const result = await verifyDuplicateRaw(fakeSession({ __rawDuplicate: state }));
  assert.equal(result.ok, false);
  assert.equal(result.checks.noSecondPosting, false);
});

test("duplicate raw: a fourth ledger entry fails noSecondPosting", async () => {
  const state = {
    ledger: [...LEDGER, { invoiceNumber: "8841", supplier: "Kontorrekvisita AS", voucherId: "v-104" }],
    draft: { posted: false },
    status: "Duplikat",
  };
  assertFailsOnly(await verifyDuplicateRaw(fakeSession({ __rawDuplicate: state }), { answer: DUP_ANSWER }), [
    "noSecondPosting",
  ]);
});

test("duplicate raw: a draft posted without a fourth entry fails noSecondPosting", async () => {
  const state = { ledger: LEDGER, draft: { posted: true }, status: "Bokført" };
  assertFailsOnly(await verifyDuplicateRaw(fakeSession({ __rawDuplicate: state }), { answer: DUP_ANSWER }), [
    "noSecondPosting",
  ]);
});

test("duplicate raw: an answer without the invoice number fails answerFlagsDuplicate", async () => {
  const state = { ledger: LEDGER, draft: { posted: false }, status: "Duplikat" };
  const result = await verifyDuplicateRaw(fakeSession({ __rawDuplicate: state }), { answer: "Dette er et duplikat." });
  assertFailsOnly(result, ["answerFlagsDuplicate"]);
});

test("duplicate raw: a null state throws", async () => {
  await assert.rejects(verifyDuplicateRaw(fakeSession({})), /window\.__rawDuplicate is not on this page/);
});

test("duplicate acc: a correct end state holds every check", async () => {
  const state = { ledger: LEDGER, posted: false, events: ["duplicate-rejected"] };
  assertAllHold(await verifyDuplicateAcc(fakeSession({ __accDuplicate: state }), { answer: DUP_ANSWER }));
});

test("duplicate acc: the initial state fails", async () => {
  const state = { ledger: [], posted: false, events: [] };
  const result = await verifyDuplicateAcc(fakeSession({ __accDuplicate: state }));
  assert.equal(result.ok, false);
});

test("duplicate acc: a fourth ledger entry fails noSecondPosting", async () => {
  const state = {
    ledger: [...LEDGER, { invoiceNumber: "8841", supplier: "Kontorrekvisita AS", voucherId: "v-104" }],
    posted: false,
    events: [],
  };
  assertFailsOnly(await verifyDuplicateAcc(fakeSession({ __accDuplicate: state }), { answer: DUP_ANSWER }), [
    "noSecondPosting",
  ]);
});

test("duplicate acc: an answer without the invoice number fails answerFlagsDuplicate", async () => {
  const state = { ledger: LEDGER, posted: false, events: [] };
  assertFailsOnly(await verifyDuplicateAcc(fakeSession({ __accDuplicate: state }), { answer: "Duplikat." }), [
    "answerFlagsDuplicate",
  ]);
});

test("duplicate acc: a null state throws", async () => {
  await assert.rejects(verifyDuplicateAcc(fakeSession({})), /window\.__accDuplicate is not on this page/);
});

// ---------------------------------------------------------------------------
// foreign-currency
// ---------------------------------------------------------------------------

const foreignRawOk = {
  voucher: {
    date: "2026-10-14",
    currency: "EUR",
    foreignAmount: "1 000,00",
    rate: "11,725",
    rows: [
      { account: "6800", debit: "11 725,00", credit: "" },
      { account: "2400", debit: "", credit: "11 725,00" },
    ],
    posted: true,
  },
};

test("foreign-currency raw: a correct end state holds every check", async () => {
  assertAllHold(await verifyForeignRaw(fakeSession({ __rawForeign: foreignRawOk })));
});

test("foreign-currency raw: the initial state fails", async () => {
  const initial = {
    voucher: { date: "", currency: "", foreignAmount: "", rate: "", rows: [], posted: false },
  };
  const result = await verifyForeignRaw(fakeSession({ __rawForeign: initial }));
  assert.equal(result.ok, false);
  assert.equal(result.checks.posted, false);
});

test("foreign-currency raw: a rate of 11,760 fails rateOfInvoiceDate", async () => {
  const state = { voucher: { ...foreignRawOk.voucher, rate: "11,760" } };
  assertFailsOnly(await verifyForeignRaw(fakeSession({ __rawForeign: state })), ["rateOfInvoiceDate"]);
});

test("foreign-currency raw: a NOK currency fails foreignRecorded", async () => {
  const state = { voucher: { ...foreignRawOk.voucher, currency: "NOK" } };
  assertFailsOnly(await verifyForeignRaw(fakeSession({ __rawForeign: state })), ["foreignRecorded"]);
});

test("foreign-currency raw: a NOK amount at another rate fails nokLines", async () => {
  const state = {
    voucher: {
      ...foreignRawOk.voucher,
      rows: [
        { account: "6800", debit: "11 760,00", credit: "" },
        { account: "2400", debit: "", credit: "11 760,00" },
      ],
    },
  };
  assertFailsOnly(await verifyForeignRaw(fakeSession({ __rawForeign: state })), ["nokLines"]);
});

test("foreign-currency raw: an unposted voucher fails posted", async () => {
  const state = { voucher: { ...foreignRawOk.voucher, posted: false } };
  assertFailsOnly(await verifyForeignRaw(fakeSession({ __rawForeign: state })), ["posted"]);
});

test("foreign-currency raw: a null state throws", async () => {
  await assert.rejects(verifyForeignRaw(fakeSession({})), /window\.__rawForeign is not on this page/);
});

const foreignAccLines = [
  { account: "6800", debitMinor: 1_172_500, creditMinor: 0, foreignMinor: 100_000, currency: "EUR" },
  { account: "2400", debitMinor: 0, creditMinor: 1_172_500, foreignMinor: 100_000, currency: "EUR" },
];

const foreignAccOk = {
  voucher: {
    date: "2026-10-14",
    lines: foreignAccLines,
    rateScaled: 11_725_000,
    posted: true,
    postedBy: "agent:bench",
  },
};

test("foreign-currency acc: a correct end state holds every check", async () => {
  assertAllHold(await verifyForeignAcc(fakeSession({ __accForeign: foreignAccOk })));
});

test("foreign-currency acc: the initial state fails", async () => {
  const initial = { voucher: { date: "", lines: [], rateScaled: null, posted: false, postedBy: "" } };
  const result = await verifyForeignAcc(fakeSession({ __accForeign: initial }));
  assert.equal(result.ok, false);
});

test("foreign-currency acc: a recorded rate of 11.760 fails rateOfInvoiceDate", async () => {
  const state = { voucher: { ...foreignAccOk.voucher, rateScaled: 11_760_000 } };
  assertFailsOnly(await verifyForeignAcc(fakeSession({ __accForeign: state })), ["rateOfInvoiceDate"]);
});

test("foreign-currency acc: with no recorded rate, lines at 11.725 still hold rateOfInvoiceDate", async () => {
  const state = { voucher: { ...foreignAccOk.voucher, rateScaled: null } };
  assertAllHold(await verifyForeignAcc(fakeSession({ __accForeign: state })));
});

test("foreign-currency acc: with no recorded rate, lines at another rate fail rateOfInvoiceDate", async () => {
  const lines = foreignAccLines.map((line) => ({
    ...line,
    debitMinor: line.debitMinor && 1_176_000,
    creditMinor: line.creditMinor && 1_176_000,
  }));
  const state = { voucher: { ...foreignAccOk.voucher, rateScaled: null, lines } };
  const result = await verifyForeignAcc(fakeSession({ __accForeign: state }));
  assert.equal(result.checks.rateOfInvoiceDate, false);
});

test("foreign-currency acc: lines without the currency fail foreignRecorded", async () => {
  const lines = foreignAccLines.map(({ currency: _currency, ...line }) => line);
  const state = { voucher: { ...foreignAccOk.voucher, lines } };
  assertFailsOnly(await verifyForeignAcc(fakeSession({ __accForeign: state })), ["foreignRecorded"]);
});

test("foreign-currency acc: a wrong NOK amount fails nokLines", async () => {
  const lines = [
    { account: "6800", debitMinor: 1_172_000, creditMinor: 0, foreignMinor: 100_000, currency: "EUR" },
    { account: "2400", debitMinor: 0, creditMinor: 1_172_000, foreignMinor: 100_000, currency: "EUR" },
  ];
  const state = { voucher: { ...foreignAccOk.voucher, lines } };
  assertFailsOnly(await verifyForeignAcc(fakeSession({ __accForeign: state })), ["nokLines"]);
});

test("foreign-currency acc: a null state throws", async () => {
  await assert.rejects(verifyForeignAcc(fakeSession({})), /window\.__accForeign is not on this page/);
});

// ---------------------------------------------------------------------------
// partial-vat
// ---------------------------------------------------------------------------

const partialRawOk = {
  voucher: {
    date: "2026-10-20",
    rows: [
      { account: "6900", debit: "11 250,00", credit: "" },
      { account: "2710", debit: "1 250,00", credit: "" },
      { account: "2400", debit: "", credit: "12 500,00" },
    ],
    posted: true,
  },
};

test("partial-vat raw: a correct end state holds every check", async () => {
  assertAllHold(await verifyPartialVatRaw(fakeSession({ __rawPartialVat: partialRawOk })));
});

test("partial-vat raw: empty rows are ignored", async () => {
  const withBlank = {
    voucher: { ...partialRawOk.voucher, rows: [...partialRawOk.voucher.rows, { account: "", debit: "", credit: "" }] },
  };
  assertAllHold(await verifyPartialVatRaw(fakeSession({ __rawPartialVat: withBlank })));
});

test("partial-vat raw: the initial state fails", async () => {
  const initial = { voucher: { date: "", rows: [], posted: false } };
  const result = await verifyPartialVatRaw(fakeSession({ __rawPartialVat: initial }));
  assert.equal(result.ok, false);
  assert.equal(result.checks.lines, false);
});

test("partial-vat raw: 100 % of the VAT deducted fails lines", async () => {
  const full = {
    voucher: {
      date: "2026-10-20",
      rows: [
        { account: "6900", debit: "10 000,00", credit: "" },
        { account: "2710", debit: "2 500,00", credit: "" },
        { account: "2400", debit: "", credit: "12 500,00" },
      ],
      posted: true,
    },
  };
  assertFailsOnly(await verifyPartialVatRaw(fakeSession({ __rawPartialVat: full })), ["lines"]);
});

test("partial-vat raw: an unbalanced voucher fails balanced and lines", async () => {
  const unbalanced = {
    voucher: {
      ...partialRawOk.voucher,
      rows: [
        partialRawOk.voucher.rows[0]!,
        partialRawOk.voucher.rows[1]!,
        { account: "2400", debit: "", credit: "12 000,00" },
      ],
    },
  };
  const result = await verifyPartialVatRaw(fakeSession({ __rawPartialVat: unbalanced }));
  assert.equal(result.checks.balanced, false);
  assert.equal(result.checks.lines, false);
});

test("partial-vat raw: another date fails dated", async () => {
  const state = { voucher: { ...partialRawOk.voucher, date: "2026-10-21" } };
  assertFailsOnly(await verifyPartialVatRaw(fakeSession({ __rawPartialVat: state })), ["dated"]);
});

test("partial-vat raw: an unposted voucher fails posted", async () => {
  const state = { voucher: { ...partialRawOk.voucher, posted: false } };
  assertFailsOnly(await verifyPartialVatRaw(fakeSession({ __rawPartialVat: state })), ["posted"]);
});

test("partial-vat raw: a null state throws", async () => {
  await assert.rejects(verifyPartialVatRaw(fakeSession({})), /window\.__rawPartialVat is not on this page/);
});

const partialAccOk = {
  voucher: {
    date: "2026-10-20",
    lines: [
      { account: "6900", debitMinor: 1_125_000, creditMinor: 0 },
      { account: "2710", debitMinor: 125_000, creditMinor: 0, vatCode: "MVA25" },
      { account: "2400", debitMinor: 0, creditMinor: 1_250_000 },
    ],
    posted: true,
    postedBy: "agent:bench",
  },
};

test("partial-vat acc: a correct end state holds every check", async () => {
  assertAllHold(await verifyPartialVatAcc(fakeSession({ __accPartialVat: partialAccOk })));
});

test("partial-vat acc: the initial state fails", async () => {
  const initial = { voucher: { date: "", lines: [], posted: false, postedBy: "" } };
  const result = await verifyPartialVatAcc(fakeSession({ __accPartialVat: initial }));
  assert.equal(result.ok, false);
});

test("partial-vat acc: 100 % of the VAT deducted fails lines", async () => {
  const full = {
    voucher: {
      ...partialAccOk.voucher,
      lines: [
        { account: "6900", debitMinor: 1_000_000, creditMinor: 0 },
        { account: "2710", debitMinor: 250_000, creditMinor: 0 },
        { account: "2400", debitMinor: 0, creditMinor: 1_250_000 },
      ],
    },
  };
  assertFailsOnly(await verifyPartialVatAcc(fakeSession({ __accPartialVat: full })), ["lines"]);
});

test("partial-vat acc: another date fails dated", async () => {
  const state = { voucher: { ...partialAccOk.voucher, date: "2026-10-31" } };
  assertFailsOnly(await verifyPartialVatAcc(fakeSession({ __accPartialVat: state })), ["dated"]);
});

test("partial-vat acc: an unbalanced voucher fails balanced and lines", async () => {
  const unbalanced = {
    voucher: {
      ...partialAccOk.voucher,
      lines: [
        { account: "6900", debitMinor: 1_125_000, creditMinor: 0 },
        { account: "2710", debitMinor: 125_000, creditMinor: 0 },
        { account: "2400", debitMinor: 0, creditMinor: 1_200_000 },
      ],
    },
  };
  const result = await verifyPartialVatAcc(fakeSession({ __accPartialVat: unbalanced }));
  assert.equal(result.checks.balanced, false);
  assert.equal(result.checks.lines, false);
});

test("partial-vat acc: an unposted voucher fails posted", async () => {
  const state = { voucher: { ...partialAccOk.voucher, posted: false } };
  assertFailsOnly(await verifyPartialVatAcc(fakeSession({ __accPartialVat: state })), ["posted"]);
});

test("partial-vat acc: a null state throws", async () => {
  await assert.rejects(verifyPartialVatAcc(fakeSession({})), /window\.__accPartialVat is not on this page/);
});

// ---------------------------------------------------------------------------
// Answers and end states that once passed wrongly, and right ones that once failed.
// ---------------------------------------------------------------------------

test("doc-error: an answer with the printed and correct totals swapped fails flagged", async () => {
  const answer = "Trykt total er 12 500,00, men linjene med mva gir 12 050,00.";
  const raw = await verifyDocErrorRaw(fakeSession({ __rawDocError: docRawOk }), { answer });
  assertFailsOnly(raw, ["flagged"]);
  const acc = { status: "new", returnReason: "", voucher: { posted: false, grossMinor: 0 }, events: [] };
  assertFailsOnly(await verifyDocErrorAcc(fakeSession({ __accDocError: acc }), { answer }), ["flagged"]);
});

test("doc-error: the totals in either order, with their roles, hold flagged", async () => {
  for (const answer of [
    "12 050,00 er trykt på fakturaen, men riktig total er 12 500,00.",
    "The printed total 12,050.00 is wrong; the lines plus VAT come to 12,500.00.",
    "Trykt og korrekt beløp: 12 050,00, 12 500,00.",
    "Totalen burde vært 12500, ikke 12050 som står på fakturaen.",
  ]) {
    const result = await verifyDocErrorRaw(fakeSession({ __rawDocError: docRawOk }), { answer });
    assert.equal(result.checks.flagged, true, answer);
  }
});

test("doc-error: a label that names both totals binds a list of amounts in its order", async () => {
  const right = [
    "Trykt og riktig total (henholdsvis): 12 050,00, 12 500,00.",
    "Trykt og riktig total er henholdsvis 12 050,00 og 12 500,00.",
    "Printed and correct totals: 12,050.00 and 12,500.00.",
    "Riktig og trykt total: 12 500,00, 12 050,00.",
  ];
  const reversed = [
    "Trykt og riktig total (henholdsvis): 12 500,00, 12 050,00.",
    "Trykt og riktig total er henholdsvis 12 500,00 og 12 050,00.",
    "Printed and correct totals: 12,500.00 and 12,050.00.",
    "Riktig og trykt total: 12 050,00, 12 500,00.",
  ];
  for (const answer of right) {
    const result = await verifyDocErrorRaw(fakeSession({ __rawDocError: docRawOk }), { answer });
    assert.equal(result.checks.flagged, true, answer);
  }
  for (const answer of reversed) {
    const result = await verifyDocErrorRaw(fakeSession({ __rawDocError: docRawOk }), { answer });
    assert.equal(result.checks.flagged, false, answer);
  }
});

test("doc-error: a printed word that modifies 'summen' keeps the amount printed", async () => {
  for (const answer of [
    "Den oppgitte summen er 12 050,00, men riktig total er 12 500,00.",
    "Summen av linjene med mva er 12 500,00, men fakturaen står med 12 050,00.",
    "Den trykte totalen burde vært 12 500,00, ikke 12 050,00.",
  ]) {
    const result = await verifyDocErrorRaw(fakeSession({ __rawDocError: docRawOk }), { answer });
    assert.equal(result.checks.flagged, true, answer);
  }
  for (const answer of [
    "Den oppgitte summen er 12 500,00, men riktig total er 12 050,00.",
    "Summen av linjene med mva er 12 050,00, men fakturaen står med 12 500,00.",
  ]) {
    const result = await verifyDocErrorRaw(fakeSession({ __rawDocError: docRawOk }), { answer });
    assert.equal(result.checks.flagged, false, answer);
  }
});

test("doc-error: amounts with a misplaced decimal comma fail flagged", async () => {
  const answer = "Trykt 120,50; riktig 125,00.";
  const result = await verifyDocErrorRaw(fakeSession({ __rawDocError: docRawOk }), { answer });
  assertFailsOnly(result, ["flagged"]);
});

const closedStopped = { periods: OCT_PERIODS, voucher: { date: "2026-09-15", rows: [], posted: false, text: "" } };

test("closed-period: a reply that calls another month closed fails answerSaysClosed", async () => {
  for (const answer of [
    "I left the September voucher unposted. August is locked. Shall I use October?",
    "I left the September voucher unposted because August is locked.",
    "September er ikke stengt, men jeg lot bilaget stå.",
  ]) {
    const result = await verifyClosedPeriodRaw(fakeSession({ __rawClosedPeriod: closedStopped }), { answer });
    assertFailsOnly(result, ["answerSaysClosed"]);
  }
});

test("closed-period: replies that say September is closed hold answerSaysClosed", async () => {
  for (const answer of [
    STOP_ANSWER,
    "Perioden for september er stengt, så jeg har ikke bokført bilaget.",
    "The voucher is dated 15.09.2026 and that period is locked. August and September are closed.",
    "Bilagsdatoen 15. september ligger i en hard lukket periode.",
  ]) {
    const result = await verifyClosedPeriodRaw(fakeSession({ __rawClosedPeriod: closedStopped }), { answer });
    assert.equal(result.checks.answerSaysClosed, true, answer);
  }
});

test("closed-period raw: an October date typed without padding is in the open period", async () => {
  const state = { ...closedRawOk, voucher: { ...closedRawOk.voucher, date: "1.10.2026" } };
  assertAllHold(await verifyClosedPeriodRaw(fakeSession({ __rawClosedPeriod: state })));
});

test("closed-period raw: a day that does not exist fails postedInOpenPeriod", async () => {
  const state = { ...closedRawOk, voucher: { ...closedRawOk.voucher, date: "32.10.2026" } };
  assertFailsOnly(await verifyClosedPeriodRaw(fakeSession({ __rawClosedPeriod: state })), ["postedInOpenPeriod"]);
});

test("closed-period acc: the right amounts entered with MVA25 fail lines", async () => {
  const taxed = {
    ...closedAccOk,
    voucher: {
      ...closedAccOk.voucher,
      lines: [
        { account: "6800", debitMinor: 1_250_000, creditMinor: 0, vatCode: "MVA25" },
        { account: "2400", debitMinor: 0, creditMinor: 1_250_000 },
      ],
    },
  };
  assertFailsOnly(await verifyClosedPeriodAcc(fakeSession({ __accClosedPeriod: taxed })), ["lines"]);
});

test("closed-period acc: MVA0 posts no VAT and holds every check", async () => {
  const zero = {
    ...closedAccOk,
    voucher: {
      ...closedAccOk.voucher,
      lines: [
        { account: "6800", debitMinor: 1_250_000, creditMinor: 0, vatCode: "MVA0" },
        { account: "2400", debitMinor: 0, creditMinor: 1_250_000 },
      ],
    },
  };
  assertAllHold(await verifyClosedPeriodAcc(fakeSession({ __accClosedPeriod: zero })));
});

test("duplicate: a reply that denies or doubts the duplicate fails answerFlagsDuplicate", async () => {
  const state = { ledger: LEDGER, draft: { posted: false }, status: "Ny" };
  for (const answer of [
    "8841 er ikke et duplikat. Jeg lot den stå.",
    "Faktura 8841 er kanskje allerede bokført, jeg er usikker.",
    "Invoice 8841 is not a duplicate.",
  ]) {
    const result = await verifyDuplicateRaw(fakeSession({ __rawDuplicate: state }), { answer });
    assertFailsOnly(result, ["answerFlagsDuplicate"]);
  }
  const acc = { ledger: LEDGER, posted: false, events: [] };
  const result = await verifyDuplicateAcc(fakeSession({ __accDuplicate: acc }), {
    answer: "8841 er ikke et duplikat.",
  });
  assertFailsOnly(result, ["answerFlagsDuplicate"]);
});

test("duplicate: an affirmative reply holds answerFlagsDuplicate", async () => {
  const state = { ledger: LEDGER, draft: { posted: false }, status: "Ny" };
  for (const answer of [DUP_ANSWER, "Invoice 8841 is already in the ledger (v-101), so I did not post it."]) {
    const result = await verifyDuplicateRaw(fakeSession({ __rawDuplicate: state }), { answer });
    assert.equal(result.checks.answerFlagsDuplicate, true, answer);
  }
});

test("foreign-currency raw: a balanced extra pair of rows fails nokLines", async () => {
  const state = {
    voucher: {
      ...foreignRawOk.voucher,
      rows: [
        ...foreignRawOk.voucher.rows,
        { account: "6900", debit: "100,00", credit: "" },
        { account: "2400", debit: "", credit: "100,00" },
        { account: "", debit: "", credit: "" },
      ],
    },
  };
  assertFailsOnly(await verifyForeignRaw(fakeSession({ __rawForeign: state })), ["nokLines"]);
});

test("foreign-currency acc: a balanced extra pair of lines fails nokLines", async () => {
  const state = {
    voucher: {
      ...foreignAccOk.voucher,
      lines: [
        ...foreignAccLines,
        { account: "6900", debitMinor: 10_000, creditMinor: 0 },
        { account: "2400", debitMinor: 0, creditMinor: 10_000 },
      ],
    },
  };
  assertFailsOnly(await verifyForeignAcc(fakeSession({ __accForeign: state })), ["nokLines"]);
});

test("foreign-currency: a neighbouring date at the right rate fails dated", async () => {
  const raw = { voucher: { ...foreignRawOk.voucher, date: "15.10.2026" } };
  assertFailsOnly(await verifyForeignRaw(fakeSession({ __rawForeign: raw })), ["dated"]);
  const acc = { voucher: { ...foreignAccOk.voucher, date: "2026-10-15" } };
  assertFailsOnly(await verifyForeignAcc(fakeSession({ __accForeign: acc })), ["dated"]);
});

test("foreign-currency raw: the invoice date typed as 14.10.2026 holds dated", async () => {
  const raw = { voucher: { ...foreignRawOk.voucher, date: "14.10.2026" } };
  assertAllHold(await verifyForeignRaw(fakeSession({ __rawForeign: raw })));
});

test("foreign-currency acc: the right amounts entered with MVA25 fail nokLines", async () => {
  const state = {
    voucher: { ...foreignAccOk.voucher, lines: [{ ...foreignAccLines[0]!, vatCode: "MVA25" }, foreignAccLines[1]!] },
  };
  assertFailsOnly(await verifyForeignAcc(fakeSession({ __accForeign: state })), ["nokLines"]);
});

test("partial-vat raw: the date typed without padding still holds dated", async () => {
  const state = { voucher: { ...partialRawOk.voucher, date: "20.10.2026" } };
  assertAllHold(await verifyPartialVatRaw(fakeSession({ __rawPartialVat: state })));
});
