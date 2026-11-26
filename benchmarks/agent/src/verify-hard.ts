/**
 * End-state checks for the five hard tasks (document error, closed period,
 * duplicate invoice, foreign currency, partial VAT). Each reads the window
 * mirror its page writes (window.__rawX / window.__accX) through the harness's
 * own evaluate, never through the model. The expected numbers are a copy of
 * the fixtures in apps/www/src/components/bench/hard-data.ts; the two are kept
 * apart on purpose, so a change to one side shows up in the unit tests.
 */
import type { Session } from "./session.js";
import { vatPostings } from "@booki-aui/core/voucher";
import { NO_VAT_CODES, nbMinor, verdict, type Verification } from "./verify.js";

async function readState<T>(session: Session, key: string): Promise<T> {
  const state = await session.evaluate<T | null>(`window.${key} ?? null`);
  if (!state) throw new Error(`window.${key} is not on this page`);
  return state;
}

type Row = { account: string; debit: string; credit: string };
type Line = { account: string; debitMinor: number | null; creditMinor: number | null; vatCode?: string };
type PeriodRow = { code: string; status: string };

// ---------------------------------------------------------------------------
// Shared helpers.
// ---------------------------------------------------------------------------

/** A raw row's account text, matched by its leading number like verify.ts does. */
const accountMatches = (text: string, account: string) => new RegExp(`^\\s*${account}(\\D|$)`).test(text);

/**
 * One amount: whole kroner grouped in threes by a space, a no-break space, a
 * dot or a comma (12 500, 12.500, 12,500), or not grouped (12500), then an
 * optional decimal comma or point with exactly two digits. Three digits after
 * a separator are a group, two are øre, so 12,50 is 12 kroner 50 and a comma
 * and a space between two amounts separate them.
 */
const AMOUNT = /(?<![\d,.])(\d{1,3}(?:[ \u00a0\u202f.,]\d{3})+|\d+)(?:[,.](\d{2}))?(?!\d|[,.]\d)/g;

/** Every amount in a text, in minor units, with where it starts and ends. */
function amountsIn(text: string): { minor: number; start: number; end: number }[] {
  return [...text.matchAll(AMOUNT)].map((match) => ({
    minor: Number(match[1]!.replace(/[ \u00a0\u202f.,]/g, "")) * 100 + Number(match[2] ?? 0),
    start: match.index,
    end: match.index + match[0].length,
  }));
}

/**
 * A text cut into sentences. A full stop ends a sentence only after a letter,
 * so "15. september", "15.09.2026" and "12.500" stay whole.
 */
const sentencesOf = (text: string) => text.split(/(?<=[^\d\s][.!?])\s+|\n+/);

/** A negation or a hedge among the last few words before a position in a sentence. */
const NEGATED =
  /\b(ikke|ikkje|aldri|not|isn't|aren't|wasn't|never|no longer|kanskje|muligens|maybe|might|possibly|usikker|unsure)\b(\s+\S+){0,2}\s*$/i;
const negatedBefore = (sentence: string, index: number) => NEGATED.test(sentence.slice(0, index));

/** A calendar date typed as ISO yyyy-mm-dd or Norwegian d.m.yyyy, as ISO; "" when it is not a real day. */
export function isoDateOf(text: string): string {
  const t = text.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const nb = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : nb ? [nb[3], nb[2], nb[1]] : [];
  if (!y || !m || !d) return "";
  const out = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const date = new Date(`${out}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === out ? out : "";
}

/** The periods that must stay as they are: August and September locked, October open. */
function periodsUnchanged(periods: PeriodRow[]): boolean {
  const byCode = Object.fromEntries(periods.map((p) => [p.code, p.status]));
  return byCode["2026-08"] === "hard-closed" && byCode["2026-09"] === "hard-closed" && byCode["2026-10"] === "open";
}

/** The raw page writes the date as typed: ISO, or Norwegian 31.10.2026 style, padded or not. */
const rawDateIs = (text: string, iso: string) => isoDateOf(text) === iso;

/** Non-empty raw rows: a row with nothing in it is ignored. */
const nonEmptyRows = (rows: Row[]) => rows.filter((row) => row.account.trim() || row.debit.trim() || row.credit.trim());

/** A Booki voucher's lines as the ledger receives them: a line with a VAT code above 0 % is split into net and VAT. */
function ledgerPostings(lines: Line[]): Line[] {
  return vatPostings(
    lines.map((line, i) => ({
      id: String(i + 1),
      accountName: "",
      account: line.account,
      debitMinor: line.debitMinor ?? 0,
      creditMinor: line.creditMinor ?? 0,
      ...(line.vatCode ? { vatCode: line.vatCode } : {}),
    })),
    NO_VAT_CODES,
  );
}

/** Non-empty Booki lines: a line with no account and no amount is ignored. */
const nonEmptyLines = <T extends Line>(lines: T[]): T[] =>
  lines.filter((line) => line.account.trim() || (line.debitMinor ?? 0) !== 0 || (line.creditMinor ?? 0) !== 0);

// ---------------------------------------------------------------------------
// 1. Document error: the printed total is wrong (lines + VAT = 12 500,00,
//    printed 12 050,00). The agent must not post it and must say what is off.
// ---------------------------------------------------------------------------

/** The printed total and the correct total. */
export const DOC_ERROR_EXPECTED = {
  printedGrossMinor: 1_205_000,
  correctGrossMinor: 1_250_000,
  /** Words that call an amount the one printed on the invoice. */
  printedWords: /trykt|oppgitt|påført|står|fakturert|printed|stated|shown|invoiced|says/gi,
  /** Words that call an amount the right one, worked out from the lines. */
  correctWords:
    /riktig|korrekt|skal være|skulle vært|burde|beregnet|utregnet|gir|blir|correct|should|calculated|computed|actual|adds up|comes to/gi,
  /**
   * A generic noun for a total. It calls an amount the worked-out one ("summen
   * av linjene") unless a printed word modifies it ("den oppgitte summen").
   */
  genericWords: /summen/gi,
  /** At least ten characters of a real reason when the page is returned. */
  minReasonLength: 10,
} as const;

type RawDocErrorState = {
  status: "new" | "posted" | "returned";
  returnReason: string;
  voucher: { posted: boolean };
  stated: { grossText: string };
};

type AccDocErrorState = {
  status: "new" | "posted" | "returned";
  returnReason: string;
  voucher: { posted: boolean; grossMinor: number };
  events: string[];
};

/** Not posted: neither the invoice status nor a voucher says it was. */
const docErrorNotPosted = (status: string, posted: boolean) => status !== "posted" && !posted;

type DocRole = "printed" | "correct";

/**
 * The words before an amount in its own clause. The clause runs back to the
 * amount before it, or to a full stop, a semicolon or a "but". A colon ends it
 * too, unless nothing but the amount follows the colon: then the label before
 * the colon names it ("Trykt total: 12 050").
 */
function clauseBefore(answer: string, start: number, previousEnd: number): string {
  const clause =
    answer
      .slice(previousEnd, start)
      .split(/[.;!?]\s|\bmen\b|\bbut\b|\bwhile\b|\bmens\b/i)
      .pop() ?? "";
  const parts = clause.split(/:\s/);
  const after = parts.pop() ?? "";
  return /\p{L}/u.test(after) || parts.length === 0 ? after : (parts.pop() ?? "");
}

/** Where a clause calls something printed or correct, in order. */
function roleWordsIn(clause: string): { role: DocRole; index: number }[] {
  const e = DOC_ERROR_EXPECTED;
  const printed = [...clause.matchAll(e.printedWords)].map((m) => ({ role: "printed" as const, index: m.index }));
  const correct = [...clause.matchAll(e.correctWords)].map((m) => ({ role: "correct" as const, index: m.index }));
  // "den oppgitte summen": a printed word within two words before the noun keeps the noun printed.
  const modified = new RegExp(`(${e.printedWords.source})\\S*(\\s+\\S+)?\\s+$`, "i");
  const generic = [...clause.matchAll(e.genericWords)]
    .filter((m) => !modified.test(clause.slice(0, m.index)))
    .map((m) => ({ role: "correct" as const, index: m.index }));
  return [...printed, ...correct, ...generic].sort((a, b) => a.index - b.index);
}

/** Between two amounts of one list: a comma, "og" or "and", with a currency at most. */
const LIST_GAP = /^\s*(kr\.?|nok)?\s*(,|og|and|&)?\s*(kr\.?|nok)?\s*$/i;

/**
 * The order a label names both roles in ("Trykt og riktig total", "printed and
 * correct totals"): the two words joined by "og", "and", "&", "/" or a comma.
 * Null when the clause is not such a label, as in "den trykte totalen burde vært".
 */
function labelOrder(clause: string, words: { role: DocRole; index: number }[]): DocRole[] | null {
  const first = words[0];
  const second = words.find((w) => w.role !== first?.role);
  if (!first || !second) return null;
  const between = clause.slice(first.index, second.index).replace(/^\p{L}+/u, "");
  return /^\s*(og|and|&|\/|,)\s*$/i.test(between) ? [first.role, second.role] : null;
}

/**
 * The role the answer gives each amount, or null. One role word before an
 * amount names it, the last one when there are several. A label that names
 * both, followed by a list of amounts, names them in its order: "Trykt og
 * riktig total: 12 050, 12 500" gives the first printed and the second correct.
 */
function docRoles(text: string, amounts: { start: number; end: number }[]): (DocRole | null)[] {
  const roles: (DocRole | null)[] = [];
  let i = 0;
  while (i < amounts.length) {
    const clause = clauseBefore(text, amounts[i]!.start, i === 0 ? 0 : amounts[i - 1]!.end);
    const words = roleWordsIn(clause);
    const order = labelOrder(clause, words);
    let end = i + 1;
    while (end < amounts.length && LIST_GAP.test(text.slice(amounts[end - 1]!.end, amounts[end]!.start))) end += 1;
    if (order && end - i >= 2) {
      for (let k = i; k < end; k += 1) roles.push(order[k - i] ?? null);
      i = end;
      continue;
    }
    roles.push(words.at(-1)?.role ?? null);
    i += 1;
  }
  return roles;
}

/**
 * The answer names both the printed total and the correct one, and calls
 * neither by the other's name: "printed 12 500, the lines give 12 050" has
 * the two the wrong way round and fails.
 */
const docErrorFlagged = (answer: string | undefined) => {
  const text = answer ?? "";
  const e = DOC_ERROR_EXPECTED;
  const amounts = amountsIn(text);
  if (!amounts.some((a) => a.minor === e.printedGrossMinor) || !amounts.some((a) => a.minor === e.correctGrossMinor)) {
    return false;
  }
  const roles = docRoles(text, amounts);
  return amounts.every((amount, i) => {
    if (amount.minor === e.printedGrossMinor) return roles[i] !== "correct";
    if (amount.minor === e.correctGrossMinor) return roles[i] !== "printed";
    return true;
  });
};

export async function verifyDocErrorRaw(session: Session, context?: { answer?: string }): Promise<Verification> {
  const state = await readState<RawDocErrorState>(session, "__rawDocError");
  const checks = {
    notPosted: docErrorNotPosted(state.status, state.voucher.posted),
    noVoucher: !state.voucher.posted,
    flagged: docErrorFlagged(context?.answer),
  };
  // Returning the invoice is recorded in `observed` but not required, as on the Booki page: sending
  // something to the supplier is a message on the user's behalf, not part of posting an invoice.
  return verdict(checks, state.voucher.posted, state);
}

export async function verifyDocErrorAcc(session: Session, context?: { answer?: string }): Promise<Verification> {
  const state = await readState<AccDocErrorState>(session, "__accDocError");
  // Returning the invoice is recorded in `observed` but not required: a Booki control may not be able to send it back.
  const checks = {
    notPosted: docErrorNotPosted(state.status, state.voucher.posted),
    noVoucher: !state.voucher.posted,
    flagged: docErrorFlagged(context?.answer),
  };
  return verdict(checks, state.voucher.posted, state);
}

// ---------------------------------------------------------------------------
// 2. Closed period: a voucher dated 2026-09-15 must not be posted there, and
//    the locked periods stay locked. Two answers are right: post it in the open
//    period (October) with the original date in its text, or post nothing and
//    tell the person the period is closed. Moving a voucher's date is an
//    accounting decision, so stopping to ask counts as right.
// ---------------------------------------------------------------------------

export const CLOSED_PERIOD_EXPECTED = {
  amountMinor: 1_250_000,
  debitAccount: "6800",
  creditAccount: "2400",
  /** The original date, in the forms an explanation would use. */
  explainedForms: ["2026-09-15", "15.09.2026", "15. september"],
} as const;

/** The posted date is a real day in October 2026, typed as ISO or Norwegian d.m.yyyy. */
const inOctober = (date: string) => isoDateOf(date).startsWith("2026-10-");

const CLOSED_WORDS = /lukket|stengt|låst|sperret|closed|locked/g;
const SEPTEMBER = /september|2026-09|\b0?9\.2026|15\. ?sept/g;
/** Another month, by name or period code, in Norwegian or English. "may" is left out: it is also a verb. */
const OTHER_MONTH =
  /\b(januar|january|februar|february|mars|march|april|mai|juni|june|juli|july|august|oktober|october|november|desember|december)\b|2026-(0[1-8]|1[0-2])|\b(0?[1-8]|1[0-2])\.2026/;

/**
 * The reply tells the person September is closed: in one sentence, a word for
 * closed and September (by name, period or date), with no other month between
 * them and no "not" just before the word. "August is locked" beside a
 * September voucher, or "September is not closed", does not count. A
 * sentence that calls "the period" closed may take September from the
 * sentence before it (periodRefersBack).
 */
const answerSaysClosed = (answer: string | undefined) => {
  const sentences = sentencesOf((answer ?? "").toLowerCase());
  return sentences.some((sentence, i) => {
    const closed = [...sentence.matchAll(CLOSED_WORDS)].filter((m) => !negatedBefore(sentence, m.index));
    const months = [...sentence.matchAll(SEPTEMBER)];
    if (months.length === 0) return closed.length > 0 && periodRefersBack(sentence, sentences[i - 1]);
    return closed.some((c) =>
      months.some((m) => {
        const [from, to] = m.index < c.index ? [m.index + m[0].length, c.index] : [c.index + c[0].length, m.index];
        return !OTHER_MONTH.test(sentence.slice(from, to));
      }),
    );
  });
};

/** "Perioden", "that period": a reference back to a period named before. */
const PERIOD_REFERENCE = /\b(perioden|denne perioden|den perioden|bilagets periode|(the|that|this|its) period)\b/;

/**
 * A sentence with no month of its own that calls "the period" closed points
 * back to the sentence before it, when that one names September and no other
 * month: "Bilaget er datert 15. september. Perioden er stengt." It does not
 * borrow a month that is not September, nor one beside another month.
 */
function periodRefersBack(sentence: string, previous: string | undefined): boolean {
  if (!previous || !PERIOD_REFERENCE.test(sentence) || OTHER_MONTH.test(sentence)) return false;
  return new RegExp(SEPTEMBER.source).test(previous) && !OTHER_MONTH.test(previous);
}

const explainsOriginalDate = (text: string) => {
  const lower = text.toLowerCase();
  return CLOSED_PERIOD_EXPECTED.explainedForms.some((form) => lower.includes(form.toLowerCase()));
};

/** The other right answer: nothing posted, the periods as they were, and a reply that says September is closed. */
function stoppedAndAsked(state: unknown, periodsUntouched: boolean, context?: { answer?: string }): Verification {
  const checks = { periodsUntouched, answerSaysClosed: answerSaysClosed(context?.answer) };
  return verdict(checks, false, state);
}

type RawClosedPeriodState = {
  periods: PeriodRow[];
  voucher: { date: string; rows: Row[]; posted: boolean; text: string };
};

type AccClosedPeriodState = {
  periods: PeriodRow[];
  voucher: { date: string; lines: Line[]; posted: boolean; text: string; postedBy: string };
  events: string[];
};

export async function verifyClosedPeriodRaw(session: Session, context?: { answer?: string }): Promise<Verification> {
  const state = await readState<RawClosedPeriodState>(session, "__rawClosedPeriod");
  if (!state.voucher.posted) return stoppedAndAsked(state, periodsUnchanged(state.periods), context);
  const e = CLOSED_PERIOD_EXPECTED;
  const rows = nonEmptyRows(state.voucher.rows);
  const lineOk = (account: string, side: "debit" | "credit") =>
    rows.some(
      (row) =>
        accountMatches(row.account, account) &&
        nbMinor(row[side]) === e.amountMinor &&
        nbMinor(row[side === "debit" ? "credit" : "debit"]) === 0,
    );
  const checks = {
    postedInOpenPeriod: state.voucher.posted && inOctober(state.voucher.date),
    lines: rows.length === 2 && lineOk(e.debitAccount, "debit") && lineOk(e.creditAccount, "credit"),
    periodsUntouched: periodsUnchanged(state.periods),
    explained: explainsOriginalDate(state.voucher.text),
  };
  return verdict(checks, state.voucher.posted, state);
}

export async function verifyClosedPeriodAcc(session: Session, context?: { answer?: string }): Promise<Verification> {
  const state = await readState<AccClosedPeriodState>(session, "__accClosedPeriod");
  const untouched = periodsUnchanged(state.periods) && !state.events.includes("periods-changed");
  if (!state.voucher.posted) return stoppedAndAsked(state, untouched, context);
  const e = CLOSED_PERIOD_EXPECTED;
  // The task asks for no VAT: a line entered with MVA25 posts net and VAT, so it does not match.
  const lines = ledgerPostings(nonEmptyLines(state.voucher.lines));
  const lineOk = (account: string, side: "debitMinor" | "creditMinor") =>
    lines.some(
      (line) =>
        line.account === account &&
        line[side] === e.amountMinor &&
        (line[side === "debitMinor" ? "creditMinor" : "debitMinor"] ?? 0) === 0,
    );
  const checks = {
    postedInOpenPeriod:
      state.voucher.posted && /^2026-10-\d\d$/.test(state.voucher.date.trim()) && inOctober(state.voucher.date),
    lines: lines.length === 2 && lineOk(e.debitAccount, "debitMinor") && lineOk(e.creditAccount, "creditMinor"),
    periodsUntouched: periodsUnchanged(state.periods) && !state.events.includes("periods-changed"),
    explained: explainsOriginalDate(state.voucher.text),
  };
  return verdict(checks, state.voucher.posted, state);
}

// ---------------------------------------------------------------------------
// 3. Duplicate: the invoice 8841 is already in the ledger. The agent must not
//    post it a second time and must say it is a duplicate.
// ---------------------------------------------------------------------------

export const DUPLICATE_EXPECTED = {
  ledgerCount: 3,
  invoiceNumber: "8841",
  duplicateWords: /dupl|allerede|kopi|already|twice|to ganger/i,
} as const;

type LedgerEntry = { invoiceNumber: string; supplier: string; voucherId: string };

type RawDuplicateState = { ledger: LedgerEntry[]; draft: { posted: boolean }; status: string };
type AccDuplicateState = { ledger: LedgerEntry[]; posted: boolean; events: string[] };

/** A verb for posting. A "not" beside it is about the posting, not about what the invoice is. */
const POSTING_VERB = /\b(bokfør\w*|ført|post(ed|et|ing)?|book(ed)?|registrer\w*|record(ed)?|enter(ed)?)\b/i;
const HEDGE = /^(kanskje|muligens|maybe|might|possibly|usikker|unsure)$/i;

/**
 * The words before a duplicate word deny or doubt it. A hedge always does. A
 * "not" does unless a posting verb is beside it and the word names the invoice
 * a duplicate (not "twice"): "Jeg bokførte ikke duplikatet" says what the agent
 * did, while "8841 er ikke et duplikat" and "ikke bokført to ganger" do not
 * say it is a duplicate.
 */
function deniesDuplicate(sentence: string, match: RegExpExecArray | RegExpMatchArray): boolean {
  const before = sentence.slice(0, match.index);
  const negation = NEGATED.exec(before);
  if (!negation) return false;
  if (HEDGE.test(negation[1]!) || /twice|to ganger/i.test(match[0])) return true;
  const previous = /(\S+)\s*$/.exec(before.slice(0, negation.index))?.[1] ?? "";
  return !POSTING_VERB.test(negation[0]) && !POSTING_VERB.test(previous);
}

/**
 * The reply says 8841 is a duplicate: the number, and in some sentence a word
 * for duplicate or already booked that the words before it do not deny or
 * doubt. "8841 er ikke et duplikat" does not count.
 */
const answerFlagsDuplicate = (answer: string | undefined) => {
  const text = answer ?? "";
  if (!text.includes(DUPLICATE_EXPECTED.invoiceNumber)) return false;
  const words = new RegExp(DUPLICATE_EXPECTED.duplicateWords.source, "gi");
  return sentencesOf(text).some((sentence) => [...sentence.matchAll(words)].some((m) => !deniesDuplicate(sentence, m)));
};

export async function verifyDuplicateRaw(session: Session, context?: { answer?: string }): Promise<Verification> {
  const state = await readState<RawDuplicateState>(session, "__rawDuplicate");
  const checks = {
    noSecondPosting: state.ledger.length === DUPLICATE_EXPECTED.ledgerCount && !state.draft.posted,
    answerFlagsDuplicate: answerFlagsDuplicate(context?.answer),
  };
  return verdict(checks, state.draft.posted, state);
}

export async function verifyDuplicateAcc(session: Session, context?: { answer?: string }): Promise<Verification> {
  const state = await readState<AccDuplicateState>(session, "__accDuplicate");
  const checks = {
    noSecondPosting: state.ledger.length === DUPLICATE_EXPECTED.ledgerCount && !state.posted,
    answerFlagsDuplicate: answerFlagsDuplicate(context?.answer),
  };
  return verdict(checks, state.posted, state);
}

// ---------------------------------------------------------------------------
// 4. Foreign currency: EUR 1 000,00 at the rate of 2026-10-14 (11.725), so
//    the NOK voucher is 11 725,00 with the currency and rate recorded.
// ---------------------------------------------------------------------------

export const FOREIGN_EXPECTED = {
  nokMinor: 1_172_500,
  foreignMinor: 100_000,
  currency: "EUR",
  rate: 11.725,
  rateScaled: 11_725_000,
  debitAccount: "6800",
  creditAccount: "2400",
} as const;

/** The invoice date the task gives: the voucher is dated on it. */
const FOREIGN_DATE = "2026-10-14";

type RawForeignState = {
  voucher: { date: string; currency: string; foreignAmount: string; rate: string; rows: Row[]; posted: boolean };
};

type AccForeignLine = Line & { foreignMinor?: number; currency?: string; vatCode?: string };
type AccForeignState = {
  voucher: { date: string; lines: AccForeignLine[]; rateScaled: number | null; posted: boolean; postedBy: string };
};

/** The rate the text says, read with a decimal comma as Norwegians write it. */
const parseRate = (text: string) => Number(text.replace(/\s/g, "").replace(",", "."));

export async function verifyForeignRaw(session: Session): Promise<Verification> {
  const state = await readState<RawForeignState>(session, "__rawForeign");
  const v = state.voucher;
  const rows = nonEmptyRows(v.rows);
  const rowOk = (account: string, side: "debit" | "credit") =>
    rows.some(
      (row) =>
        accountMatches(row.account, account) &&
        nbMinor(row[side]) === FOREIGN_EXPECTED.nokMinor &&
        nbMinor(row[side === "debit" ? "credit" : "debit"]) === 0,
    );
  const checks = {
    posted: v.posted,
    dated: isoDateOf(v.date) === FOREIGN_DATE,
    nokLines:
      rows.length === 2 &&
      rowOk(FOREIGN_EXPECTED.debitAccount, "debit") &&
      rowOk(FOREIGN_EXPECTED.creditAccount, "credit"),
    foreignRecorded:
      v.currency.trim().toUpperCase() === FOREIGN_EXPECTED.currency &&
      nbMinor(v.foreignAmount) === FOREIGN_EXPECTED.foreignMinor,
    rateOfInvoiceDate: parseRate(v.rate) === FOREIGN_EXPECTED.rate,
  };
  return verdict(checks, v.posted, state);
}

export async function verifyForeignAcc(session: Session): Promise<Verification> {
  const state = await readState<AccForeignState>(session, "__accForeign");
  const v = state.voucher;
  const entered = nonEmptyLines(v.lines);
  // The task asks for no Norwegian VAT: a line entered with MVA25 posts net and VAT, so it does not match.
  const lines = ledgerPostings(entered);
  const lineOk = (account: string, side: "debitMinor" | "creditMinor") =>
    lines.some(
      (line) =>
        line.account === account &&
        line[side] === FOREIGN_EXPECTED.nokMinor &&
        (line[side === "debitMinor" ? "creditMinor" : "debitMinor"] ?? 0) === 0,
    );
  // The rate is what the voucher records. Without a recorded rate, each foreign line must imply it
  // (NOK over foreign minor units), so a line at another rate still fails.
  const implied = entered
    .filter((line) => line.foreignMinor !== undefined)
    .map((line) =>
      Math.round((((line.debitMinor ?? 0) + (line.creditMinor ?? 0)) * 1_000_000) / (line.foreignMinor ?? 1)),
    );
  const rateOk =
    v.rateScaled !== null
      ? v.rateScaled === FOREIGN_EXPECTED.rateScaled
      : implied.length > 0 && implied.every((rate) => rate === FOREIGN_EXPECTED.rateScaled);
  const checks = {
    posted: v.posted,
    dated: v.date.trim() === FOREIGN_DATE,
    nokLines:
      lines.length === 2 &&
      lineOk(FOREIGN_EXPECTED.debitAccount, "debitMinor") &&
      lineOk(FOREIGN_EXPECTED.creditAccount, "creditMinor"),
    foreignRecorded: entered.some(
      (line) => line.currency === FOREIGN_EXPECTED.currency && line.foreignMinor === FOREIGN_EXPECTED.foreignMinor,
    ),
    rateOfInvoiceDate: rateOk,
  };
  return verdict(checks, v.posted, state);
}

// ---------------------------------------------------------------------------
// 5. Partial VAT: half of 250 000 of input VAT is not deductible, so 125 000
//    goes to the cost account. Debit 6900 1 125 000, debit 2710 125 000,
//    credit 2400 1 250 000.
// ---------------------------------------------------------------------------

export const PARTIAL_VAT_EXPECTED = {
  date: "2026-10-20",
  lines: [
    { account: "6900", debitMinor: 1_125_000, creditMinor: 0 },
    { account: "2710", debitMinor: 125_000, creditMinor: 0 },
    { account: "2400", debitMinor: 0, creditMinor: 1_250_000 },
  ],
} as const;

type RawPartialVatState = { voucher: { date: string; rows: Row[]; posted: boolean } };
type AccPartialVatState = { voucher: { date: string; lines: Line[]; posted: boolean; postedBy: string } };

/** Every expected line is found once, and nothing else is on the voucher. */
function linesMatch(lines: { account: string; debit: number; credit: number }[]): boolean {
  if (lines.length !== PARTIAL_VAT_EXPECTED.lines.length) return false;
  const remaining = [...PARTIAL_VAT_EXPECTED.lines];
  for (const line of lines) {
    const index = remaining.findIndex(
      (want) =>
        accountMatches(line.account, want.account) &&
        want.debitMinor === line.debit &&
        want.creditMinor === line.credit,
    );
    if (index === -1) return false;
    remaining.splice(index, 1);
  }
  return remaining.length === 0;
}

const isBalanced = (lines: { debit: number; credit: number }[]) => {
  const debit = lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0);
  return debit > 0 && debit === credit;
};

export async function verifyPartialVatRaw(session: Session): Promise<Verification> {
  const state = await readState<RawPartialVatState>(session, "__rawPartialVat");
  const rows = nonEmptyRows(state.voucher.rows).map((row) => ({
    account: row.account,
    debit: nbMinor(row.debit) ?? -1,
    credit: nbMinor(row.credit) ?? -1,
  }));
  const checks = {
    dated: rawDateIs(state.voucher.date, PARTIAL_VAT_EXPECTED.date),
    lines: linesMatch(rows),
    balanced: isBalanced(rows),
    posted: state.voucher.posted,
  };
  return verdict(checks, state.voucher.posted, state);
}

export async function verifyPartialVatAcc(session: Session): Promise<Verification> {
  const state = await readState<AccPartialVatState>(session, "__accPartialVat");
  const lines = nonEmptyLines(state.voucher.lines).map((line) => ({
    account: line.account.trim(),
    debit: line.debitMinor ?? 0,
    credit: line.creditMinor ?? 0,
  }));
  const checks = {
    dated: state.voucher.date.trim() === PARTIAL_VAT_EXPECTED.date,
    lines: linesMatch(lines),
    balanced: isBalanced(lines),
    posted: state.voucher.posted,
  };
  return verdict(checks, state.voucher.posted, state);
}
