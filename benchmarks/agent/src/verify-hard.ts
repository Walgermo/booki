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
  /** Words that call an amount the one printed on the invoice, or the wrong one. */
  printedWords:
    /trykt|oppgi\p{L}*|påført|står|viser|fakturert|\bfeil|uriktig|printed|stated|shows?|shown|invoiced|says|wrong|incorrect/giu,
  /** Words that call an amount the right one, worked out from the lines. */
  correctWords:
    /\briktig|\bkorrekt|skal være|skulle vært|burde|beregnet|utregnet|summerer|\bgir\b|\bblir\b|\bcorrect|should|calculated|computed|actual|adds? up|comes? to/giu,
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

/** Where a clause ends: a sentence end, a semicolon, a comma, or "men", "mens", "but", "while", "whereas". */
const CLAUSE_BREAK = /[.;!?](?:\s|$)|,\s|\b(?:men|mens|but|while|whereas)\b/i;

/**
 * The words before an amount in its own clause. The clause runs back to the
 * amount before it or to a clause break. A colon ends it too, unless nothing
 * but the amount follows the colon: then the label before the colon names it
 * ("Trykt total: 12 050").
 */
function clauseBefore(answer: string, start: number, previousEnd: number): string {
  const clause = answer.slice(previousEnd, start).split(CLAUSE_BREAK).pop() ?? "";
  const parts = clause.split(/:\s/);
  const after = parts.pop() ?? "";
  return /\p{L}/u.test(after) || parts.length === 0 ? after : (parts.pop() ?? "");
}

/** The words after an amount, up to the next amount, clause break or colon ("12 050,00 er trykt på fakturaen"). */
const clauseAfter = (answer: string, end: number, nextStart: number) =>
  answer.slice(end, nextStart).split(new RegExp(`${CLAUSE_BREAK.source}|:\\s`, "i"))[0] ?? "";

/** Where a clause calls something printed or correct, in order. */
function roleWordsIn(clause: string): { role: DocRole; index: number }[] {
  const e = DOC_ERROR_EXPECTED;
  const printed = [...clause.matchAll(e.printedWords)].map((m) => ({ role: "printed" as const, index: m.index }));
  const correct = [...clause.matchAll(e.correctWords)].map((m) => ({ role: "correct" as const, index: m.index }));
  // "den oppgitte summen": a printed word within two words before the noun keeps the noun printed.
  const modified = new RegExp(`(${e.printedWords.source})\\S*(\\s+\\S+)?\\s+$`, "iu");
  const generic = [...clause.matchAll(e.genericWords)]
    .filter((m) => !modified.test(clause.slice(0, m.index)))
    .map((m) => ({ role: "correct" as const, index: m.index }));
  return [...printed, ...correct, ...generic].sort((a, b) => a.index - b.index);
}

/** Between two amounts of one list: a comma, "og" or "and", with a currency at most. */
const LIST_GAP = /^\s*(kr\.?|nok)?\s*(,|og|and|&)?\s*(kr\.?|nok)?\s*$/i;

/**
 * What may stand between the two role words of a label that names both: the
 * rest of the first word, a noun for a total, a conjunction and an article.
 * "Trykt og riktig total", "printed and correct totals", "Trykt beløp og
 * riktig beløp", "the printed amount and the correct amount".
 */
const LABEL_JOIN =
  /^\p{L}*\s*(?:(?:beløp\p{L}*|total\p{L}*|sum\p{L}*|amounts?)\s*)?(?:og|and|&|\/|,|vs\.?|versus)\s*(?:(?:the|den|det)\s+)?$/iu;

/**
 * The order a label names both roles in. Null when the clause is not such a
 * label, as in "den trykte totalen burde vært", where no conjunction joins them.
 */
function labelOrder(clause: string, words: { role: DocRole; index: number }[]): DocRole[] | null {
  const first = words[0];
  const second = words.find((w) => w.role !== first?.role);
  if (!first || !second) return null;
  return LABEL_JOIN.test(clause.slice(first.index, second.index)) ? [first.role, second.role] : null;
}

/**
 * The role the answer gives each amount, or null. The last role word before
 * an amount in its clause names it; with none before it, the first one after
 * it does ("12 050,00 er trykt på fakturaen"). A label that names both,
 * followed by a list of amounts, names them in its order: "Trykt og riktig
 * total: 12 050, 12 500" gives the first printed and the second correct.
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
    const after = clauseAfter(text, amounts[i]!.end, amounts[i + 1]?.start ?? text.length);
    roles.push(words.at(-1)?.role ?? roleWordsIn(after)[0]?.role ?? null);
    i += 1;
  }
  return roles;
}

/**
 * The answer names both the printed total and the correct one, names at least
 * one of them for what it is, and calls neither by the other's name. "printed
 * 12 500, the lines give 12 050" has the two the wrong way round and fails;
 * "12 050 og 12 500" with no roles does not say which is which and fails too.
 */
export const docErrorFlagged = (answer: string | undefined) => {
  const text = answer ?? "";
  const e = DOC_ERROR_EXPECTED;
  const amounts = amountsIn(text);
  if (!amounts.some((a) => a.minor === e.printedGrossMinor) || !amounts.some((a) => a.minor === e.correctGrossMinor)) {
    return false;
  }
  const roles = docRoles(text, amounts);
  let named = false;
  for (const [i, amount] of amounts.entries()) {
    const want =
      amount.minor === e.printedGrossMinor ? "printed" : amount.minor === e.correctGrossMinor ? "correct" : null;
    if (!want || roles[i] === null) continue;
    if (roles[i] !== want) return false;
    named = true;
  }
  return named;
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

/** September by name, period code or date, as the reply would write it (lower case). */
const SEPT = String.raw`(?:(?:\d{1,2}\.\s?)?september|sept\b\.?|2026-09(?:-\d{2})?|(?:\d{1,2}\.)?0?9\.2026)(?:\s+2026)?`;
/** Another month, by name or period code, in Norwegian or English. "may" is left out: it is also a verb. */
const OTHER_MONTH = String.raw`\b(?:januar|january|februar|february|mars|march|april|mai|juni|june|juli|july|august|oktober|october|november|desember|december)\b|2026-(?:0[1-8]|1[0-2])|\b(?:0?[1-8]|1[0-2])\.2026`;
const ANY_MONTH = new RegExp(`${SEPT}|${OTHER_MONTH}`, "g");
const IS_SEPT = new RegExp(`^${SEPT}$`);
/** A period: "perioden", "periode", "the period", "måneden". */
const PERIOD_NOUN = String.raw`(?:regnskapsperioden|perioden|periodene|periode|periods?|måneden|month)`;
const CLOSED = String.raw`(?:hard[- ]?)?(?:lukket|lukka|stengt|låst|sperret|closed|locked)`;
const OPEN = String.raw`(?:åpen|åpent|åpne|open|opened|reopened|gjenåpnet|ulåst|unlocked)`;
const COPULA = String.raw`(?:er|is|are|was|were|var|ble|blir|has been|have been|had been|har vært|har blitt|er blitt|remains|forblir|står som|is marked as|er markert som|has the status|has status|har status|isn't|aren't|wasn't|weren't)`;
const NOT = String.raw`(?:ikke lenger|ikke|ikkje|not|no longer|never|aldri)`;
const ADVERB = String.raw`(?:endelig|hard|allerede|already|fortsatt|still|permanently|now|nå|definitivt|definitely|fully|helt|formally|formelt|currently)`;

/**
 * A statement that a period is closed or open: a subject, a copula and the
 * word for closed or open, with nothing else between them but "not", an
 * article and an adverb such as "endelig" or "already". The subject is
 * September itself ("September is locked", "August and September are
 * closed", "september-perioden") or a period, maybe with September after it
 * ("perioden for september", "periode 2026-09", "that period"). September
 * right after a preposition is the object of something else ("bilaget for
 * september er låst" is about the voucher) and is not a subject, unless a
 * relative clause follows it ("falls in September, which is hard-closed"). A hedge
 * ("kanskje", "might") between subject and predicate means no match.
 */
const PERIOD_STATEMENT = new RegExp(
  String.raw`(?:(?<sept>(?<!(?:\b(?:for|i|of|in|fra|from|datert|dated|on|på|til|to)\s+|\d\.?\s?))${SEPT}(?:\s*(?:,|og|and|&)\s*(?:${SEPT}|${OTHER_MONTH}))?(?:\s*-?\s*${PERIOD_NOUN})?)` +
    String.raw`|(?<relative>${SEPT}(?:\s*-?\s*${PERIOD_NOUN})?,?\s+(?:which|that|som))` +
    String.raw`|(?<period>\b${PERIOD_NOUN}(?:\s*\(?\s*(?:for|i|of|in)?\s*(?<qualifier>${SEPT})\s*\)?)?(?:,?\s+(?:which|that|som))?))` +
    String.raw`(?:\s*:\s*|\s+(?<copula>${COPULA})\s+)(?:(?<not>${NOT})\s+)?(?:${ADVERB}\s+){0,2}(?:(?:en|et|a|an)\s+)?(?:${ADVERB}\s+){0,2}["«']?` +
    String.raw`(?:(?<closed>${CLOSED})|(?<open>${OPEN}))(?!\p{L})`,
  "gu",
);

/** "en lukket periode", "a closed period": closed said of a period it names. */
const CLOSED_PERIOD = new RegExp(String.raw`${CLOSED}\s+(?:accounting\s+)?${PERIOD_NOUN}`, "g");

/** A conditional before a statement in its clause: "If September is closed" says nothing about it. */
const CONDITIONAL = /\b(?:hvis|dersom|if|unless|whether|om)\b(?!\s+at\b)/i;

/**
 * Whether a period named at `index` in sentence `k` is September. Its own
 * sentence decides when it names a month before the period; otherwise the
 * sentence before does. Every month in that text must be September, so
 * "Bilaget gjelder september og august. Perioden er stengt." does not count.
 */
function periodIsSeptember(sentences: string[], k: number, index: number): boolean {
  const own = [...sentences[k]!.slice(0, index).matchAll(ANY_MONTH)];
  const months = own.length > 0 ? own : [...(sentences[k - 1] ?? "").matchAll(ANY_MONTH)];
  return months.length > 0 && months.every((m) => IS_SEPT.test(m[0]));
}

/** Each statement the reply makes about September: "closed", or "open" for open or not closed. */
function septemberStatements(answer: string): ("closed" | "open")[] {
  const sentences = sentencesOf(answer.toLowerCase());
  const out: ("closed" | "open")[] = [];
  sentences.forEach((sentence, k) => {
    const conditional = (index: number) =>
      CONDITIONAL.test(
        sentence
          .slice(0, index)
          .split(/[,;:]\s/)
          .pop() ?? "",
      );
    for (const m of sentence.matchAll(PERIOD_STATEMENT)) {
      const g = m.groups!;
      if (conditional(m.index)) continue;
      const september =
        g.sept !== undefined ||
        g.relative !== undefined ||
        g.qualifier !== undefined ||
        periodIsSeptember(sentences, k, m.index);
      if (!september) continue;
      const negated = g.not !== undefined || (g.copula ?? "").endsWith("n't");
      if (g.closed !== undefined) out.push(negated ? "open" : "closed");
      else if (!negated) out.push("open");
    }
    for (const m of sentence.matchAll(CLOSED_PERIOD)) {
      if (conditional(m.index) || negatedBefore(sentence, m.index)) continue;
      if (periodIsSeptember(sentences, k, m.index)) out.push("closed");
    }
  });
  return out;
}

/**
 * The reply tells the person September is closed: some statement says that
 * September, or a period that is September, is closed, and none says it is
 * open or not closed. "August is locked", "the invoice is locked", "If
 * September is closed" and "September er kanskje stengt" say nothing about
 * it, so a reply with only those fails.
 */
export const answerSaysClosed = (answer: string | undefined) => {
  const statements = septemberStatements(answer ?? "");
  return statements.includes("closed") && !statements.includes("open");
};

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
} as const;

type LedgerEntry = { invoiceNumber: string; supplier: string; voucherId: string };

type RawDuplicateState = { ledger: LedgerEntry[]; draft: { posted: boolean }; status: string };
type AccDuplicateState = { ledger: LedgerEntry[]; posted: boolean; events: string[] };

/** A clause break for the duplicate reply: punctuation, or a word that starts a new clause. */
const DUP_CLAUSE_BREAK =
  /[,;:()]\s*|\s(?:men|but|fordi|because|since|siden|ettersom|as|da|så|so|for|som|which|that|når|when|og|and)\s/i;
const DUP_NOUN =
  /\b(?:dupl\p{L}*|kopi(?:en)?|dobbelt(?:føring|bokføring)\p{L}*|double[- ](?:posting|booking|entry))\b/giu;
const ALREADY = /\b(?:allerede|already)\b/gi;
const TWICE = /\b(?:twice|to ganger|two times)\b/gi;
/** A word for being in the ledger: what "already" must be about. */
const IN_LEDGER =
  /\b(?:bokført|ført|postert|posted|booked|registrert|registered|recorded|entered|ledger|reskontro\p{L}*|hovedbok\p{L}*|exists?|finnes|ligger|bilag|voucher|v-\d+)\b/iu;
const NEGATION =
  /\b(?:ikke|ikkje|aldri|not|never|no longer|isn't|wasn't|aren't|weren't|hasn't|haven't|hadn't|didn't|doesn't|don't|ingen)\b/i;
const DUP_HEDGE =
  /\b(?:kanskje|muligens|mulig|maybe|might|possibly|perhaps|usikker|unsure|uncertain|probably|trolig|sannsynligvis|likely|antakelig|potensielt|potential(?:ly)?|suspected|mistenkt|kan være|could be|may be)\b/i;
/** "er ikke et", "is not a", "isn't a", "ingen", "not a": the noun after it is denied. */
const DENIES_NOUN =
  /(?:\b(?:er|is|are|was|were|var|ble|blir|be)\s+(?:ikke|ikkje|not|never|aldri)|\b(?:isn't|wasn't|aren't|weren't)|\b(?:ikke|ikkje)\s+(?:er|var|blir))\s+(?:(?:et|en|a|an|the|noe|noen|any)\s+)?$|\b(?:ikke|ikkje|not)\s+(?:et|en|a|an|noe|noen|any)\s+$|\b(?:no|ingen|uten|without)\s+(?:(?:et|en|a|an|noe|noen|any)\s+)?$/i;
/** "er et", "is a", "ser ut til å være": the noun after it is said of the invoice. */
const CALLS_NOUN =
  /\b(?:er|is|are|was|var|ble|blir|be|being|looks like|ser ut som|seems to be|appears to be|ser ut til å være|registrert som|registered as|markert som|marked as)\s+(?:(?:et|en|a|an|the)\s+)?$/i;
/** "duplikat av v-101", "duplicate of an existing posting", "kopi av bilag v-101". */
const DUPLICATE_OF =
  /^\s+(?:av|of)\s+(?:v-\d+|bilag|voucher|(?:an?\s+|the\s+|en\s+|den\s+)?(?:existing|earlier|already|eksisterende|tidligere|allerede))/i;
/** "the duplicate", "this duplicate": a definite noun takes the duplicate as given. */
const DEFINITE_BEFORE = /\b(?:the|this|that|denne|dette|den|det)\s+$/i;
/** Another invoice number in the same sentence: the statement may be about that one. */
const INVOICE_NUMBER = /\b(?:faktura(?:nummer|nr\.?)?|invoice(?:\s+(?:no\.?|number|#))?)\s*#?\s*(\d{3,})/gi;

type DupStatement = "affirms" | "denies" | null;

/** What one clause says about the invoice being a duplicate or already booked. */
function dupClause(clause: string): DupStatement[] {
  const out: DupStatement[] = [];
  const hedged = DUP_HEDGE.test(clause);
  const conditional = (index: number) => CONDITIONAL.test(clause.slice(0, index));
  for (const m of clause.matchAll(DUP_NOUN)) {
    if (conditional(m.index)) continue;
    const before = clause.slice(0, m.index);
    if (DENIES_NOUN.test(before)) {
      out.push("denies");
      continue;
    }
    // "duplikatet", "kopien", "duplikatfakturaen": the Norwegian definite form.
    const definite = DEFINITE_BEFORE.test(before) || /^(?:dupl|kopi|dobbelt)\p{L}*(?:et|en)$/iu.test(m[0]);
    // "kopi" alone is only a copy: it counts as a duplicate when it is a copy of an earlier posting.
    const of = DUPLICATE_OF.test(clause.slice(m.index + m[0].length));
    const called = /^kopi/i.test(m[0]) ? CALLS_NOUN.test(before) && of : CALLS_NOUN.test(before) || of;
    if (definite || called) out.push(hedged ? null : "affirms");
  }
  for (const m of clause.matchAll(ALREADY)) {
    if (conditional(m.index) || !IN_LEDGER.test(clause)) continue;
    if (NEGATION.test(clause.slice(0, m.index))) out.push("denies");
    else out.push(hedged ? null : "affirms");
  }
  for (const m of clause.matchAll(TWICE)) {
    const before = clause.slice(0, m.index);
    if (!hedged && !conditional(m.index) && /\b(?:would|ville|vil)\b/i.test(before) && !NEGATION.test(clause)) {
      out.push("affirms");
    }
  }
  return out;
}

/**
 * The reply says 8841 is a duplicate or already booked, and nowhere denies
 * it. A statement counts when it calls the invoice a duplicate ("8841 er et
 * duplikat", "duplicate of v-101"), takes the duplicate as given ("Jeg
 * bokførte ikke duplikatet", "I did not post the duplicate invoice 8841"),
 * says it is already in the ledger with no "not" before the "already", or
 * says posting it would book it twice; and when its sentence, or the one
 * before, names 8841 and no other invoice. A hedge or an "if" makes it not
 * count. A denial anywhere ("8841 er ikke et duplikat", "was not posted
 * already") fails the reply, whatever else it says.
 */
export const answerFlagsDuplicate = (answer: string | undefined) => {
  const text = answer ?? "";
  const number = DUPLICATE_EXPECTED.invoiceNumber;
  if (!text.includes(number)) return false;
  const sentences = sentencesOf(text);
  let affirmed = false;
  for (const [k, sentence] of sentences.entries()) {
    const statements = sentence.split(DUP_CLAUSE_BREAK).flatMap((clause) => dupClause(clause));
    if (statements.includes("denies")) return false;
    const otherInvoice = [...sentence.matchAll(INVOICE_NUMBER)].some((m) => m[1] !== number);
    const named = sentence.includes(number) || (sentences[k - 1] ?? "").includes(number);
    if (statements.includes("affirms") && named && !otherInvoice) affirmed = true;
  }
  return affirmed;
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
