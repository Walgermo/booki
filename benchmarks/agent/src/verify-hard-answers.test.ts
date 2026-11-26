/**
 * The free-text answer checks of the hard tasks, as one table per verifier.
 * Each row is a reply a model could give, in Norwegian or English, and
 * whether it shows what the task asks. Every example from the review rounds
 * is here, beside the right answers it must keep passing. Where a reply is
 * too loose to judge, the table expects it to fail: counting a doubtful
 * reply as not shown is better than passing a wrong one.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { answerFlagsDuplicate, answerSaysClosed, docErrorFlagged } from "./verify-hard.js";

type Row = [answer: string, shows: boolean];

function runTable(name: string, check: (answer: string) => boolean, rows: Row[]) {
  for (const [answer, shows] of rows) {
    test(`${name}: ${shows ? "passes" : "fails"} "${answer}"`, () => {
      assert.equal(check(answer), shows, answer);
    });
  }
}

// ---------------------------------------------------------------------------
// Document error: printed 12 050,00, correct 12 500,00. Both amounts, at
// least one named for what it is, and neither named for the other.
// ---------------------------------------------------------------------------

runTable("doc-error", docErrorFlagged, [
  // Right: each total named, before or after it.
  ["Fakturaen er ikke bokført. Linjene pluss mva gir 12 500,00, men trykt total er 12 050,00.", true],
  ["12 050,00 er trykt på fakturaen, men riktig total er 12 500,00.", true],
  ["The printed total 12,050.00 is wrong; the lines plus VAT come to 12,500.00.", true],
  ["Totalen burde vært 12500, ikke 12050 som står på fakturaen.", true],
  ["Den oppgitte summen er 12 050,00, men riktig total er 12 500,00.", true],
  ["Summen av linjene med mva er 12 500,00, men fakturaen står med 12 050,00.", true],
  ["Den trykte totalen burde vært 12 500,00, ikke 12 050,00.", true],
  ["12 500,00 er riktig total, 12 050,00 er det som er trykt.", true],
  ["The invoice shows 12,050.00, but the lines add up to 12,500.00.", true],
  ["Riktig beløp er 12 500 kr, fakturaen oppgir 12 050 kr.", true],
  ["Fakturaen er feil: totalen står som 12 050,00, mens linjene summerer seg til 12 500,00.", true],
  ["The invoice total of 12,050.00 is wrong: lines (10,000.00) plus VAT (2,500.00) = 12,500.00.", true],
  ["Netto 10 000,00 + mva 2 500,00 = 12 500,00, men fakturaen viser 12 050,00.", true],
  ["Printed: 12 050,00. Correct: 12 500,00.", true],
  // Right: a label that names both, then the amounts in its order.
  ["Trykt og korrekt beløp: 12 050,00, 12 500,00.", true],
  ["Trykt og riktig total (henholdsvis): 12 050,00, 12 500,00.", true],
  ["Trykt og riktig total er henholdsvis 12 050,00 og 12 500,00.", true],
  ["Printed and correct totals: 12,050.00 and 12,500.00.", true],
  ["Riktig og trykt total: 12 500,00, 12 050,00.", true],
  ["Trykt beløp og riktig beløp: 12 050,00 og 12 500,00.", true],
  ["The printed amount and the correct amount: 12,050.00 and 12,500.00.", true],
  ["Printed total and correct total are 12,050.00 and 12,500.00 respectively.", true],
  ["Riktig beløp og trykt beløp: 12 500,00 og 12 050,00.", true],
  // Wrong: nothing, one amount, or no roles at all.
  ["Jeg sendte den i retur.", false],
  ["Ferdig.", false],
  ["Riktig total er 12 050,00.", false],
  ["Beløpene er 12 050,00 og 12 500,00.", false],
  ["Trykt 120,50; riktig 125,00.", false],
  // Wrong: the two swapped.
  ["Trykt total er 12 500,00, men linjene med mva gir 12 050,00.", false],
  ["Den oppgitte summen er 12 500,00, men riktig total er 12 050,00.", false],
  ["Summen av linjene med mva er 12 050,00, men fakturaen står med 12 500,00.", false],
  ["12 050,00 er riktig total, 12 500,00 er det som er trykt.", false],
  ["The invoice shows 12,500.00, but the lines add up to 12,050.00.", false],
  ["Printed: 12 500,00. Correct: 12 050,00.", false],
  ["The invoice total of 12,500.00 is wrong: the lines come to 12,050.00.", false],
  // Wrong: a label that names both, with the amounts the other way round.
  ["Trykt og riktig total (henholdsvis): 12 500,00, 12 050,00.", false],
  ["Trykt og riktig total er henholdsvis 12 500,00 og 12 050,00.", false],
  ["Printed and correct totals: 12,500.00 and 12,050.00.", false],
  ["Riktig og trykt total: 12 050,00, 12 500,00.", false],
  ["Trykt beløp og riktig beløp: 12 500,00 og 12 050,00.", false],
  ["The printed amount and the correct amount: 12,500.00 and 12,050.00.", false],
  ["Printed total and correct total are 12,500.00 and 12,050.00 respectively.", false],
]);

// ---------------------------------------------------------------------------
// Closed period: the reply says September is closed. The closed word must be
// said of September or of a period that points back to it, and nothing in
// the reply may say September is open.
// ---------------------------------------------------------------------------

runTable("closed-period", answerSaysClosed, [
  // Right: September, its period code or date, called closed.
  ["Jeg opprettet ikke bilaget: perioden 2026-09 er lukket. Skal det føres i oktober?", true],
  ["Ingenting er bokført. Periode 2026-09 er endelig lukket. Vil du ha bilaget i oktober?", true],
  ["Perioden for september er stengt, så jeg har ikke bokført bilaget.", true],
  ["The voucher is dated 15.09.2026 and that period is locked. August and September are closed.", true],
  ["Bilagsdatoen 15. september ligger i en hard lukket periode.", true],
  ["September is locked, so I left the voucher unposted. Shall I post it in October?", true],
  ["The September period has been hard-closed; October is open.", true],
  ["Periode 2026-09 har status hard-closed, så jeg stoppet.", true],
  ["September-perioden er låst. Oktober er åpen.", true],
  ["Oktober er åpen, men september er stengt.", true],
  ["I did not post the voucher. Its date, 2026-09-15, falls in September, which is hard-closed.", true],
  ["Periode 2026-09: lukket.", true],
  ["The voucher date (15 September 2026) is in a closed period, so I stopped.", true],
  // Right: "the period" in the next sentence, after a sentence that names only September.
  ["Bilaget er datert 15. september. Perioden er stengt, så jeg bokførte ikke.", true],
  ["The voucher is for September. That period is locked, so I did not post it.", true],
  ["Bilaget gjelder september. Perioden er stengt.", true],
  // Wrong: nothing about the closure, or another month closed.
  ["Ferdig.", false],
  ["I left the September voucher unposted. August is locked. Shall I use October?", false],
  ["I left the September voucher unposted because August is locked.", false],
  ["Bilaget er datert 15. oktober. Perioden er stengt, så jeg bokførte ikke.", false],
  ["Bilaget gjelder september og august. Perioden er stengt.", false],
  ["Bilaget er datert 15. september. August-perioden er stengt.", false],
  ["Bilaget er datert 15. september. Jeg lot det stå. Perioden er stengt.", false],
  ["I posted it in October because the period is open.", false],
  // Wrong: negated, hedged or conditional.
  ["September er ikke stengt, men jeg lot bilaget stå.", false],
  ["Bilaget er datert 15. september. Perioden er ikke stengt.", false],
  ["September er kanskje stengt, jeg er usikker.", false],
  ["If September is closed, the voucher has to go in October.", false],
  // Wrong: something else is locked, not the period.
  ["Bilaget gjelder september. Perioden er åpen, men fakturaen er låst.", false],
  ["Bilaget for september er låst for redigering.", false],
  ["The September voucher is locked, so I could not edit it.", false],
  // Wrong: says it and then contradicts it.
  ["September er stengt. Nei, september er åpen.", false],
  ["Perioden 2026-09 er lukket. Bilaget gjelder september. Perioden er åpen.", false],
]);

// ---------------------------------------------------------------------------
// Duplicate: the reply says 8841 is a duplicate or already booked. A "not"
// on the agent's own posting is fine when the object is the duplicate; a
// "not" on the duplicate or on the earlier posting is a denial, and any
// denial anywhere fails the reply.
// ---------------------------------------------------------------------------

runTable("duplicate", answerFlagsDuplicate, [
  // Right: already booked.
  ["Fakturanummer 8841 er allerede bokført, så jeg har ikke bokført den to ganger.", true],
  ["Invoice 8841 is already in the ledger (v-101), so I did not post it.", true],
  ["I did not post 8841 because it was already posted as v-101.", true],
  ["Jeg bokførte ikke 8841 som allerede er registrert i reskontro.", true],
  ["Jeg fant faktura 8841. Den er allerede bokført som bilag v-101.", true],
  // Right: called a duplicate.
  ["Faktura 8841 er et duplikat av v-101, så jeg lot den stå.", true],
  ["Faktura 8841 er en kopi av bilag v-101, så jeg bokførte den ikke.", true],
  ["Invoice 8841 is a duplicate of voucher v-101; I left it unposted.", true],
  ["Jeg bokførte ikke duplikatet av faktura 8841.", true],
  ["Jeg har ikke bokført kopien av faktura 8841.", true],
  ["I did not post the duplicate invoice 8841.", true],
  ["Posting 8841 would book it twice, so I stopped.", true],
  ["This is a duplicate: invoice 8841 was already posted (v-101).", true],
  ["I didn't post invoice 8841 since it already exists in the ledger.", true],
  ["Faktura 8841 finnes allerede i hovedboken som v-101. Jeg har ikke bokført den på nytt.", true],
  // Wrong: no number, or nothing about a duplicate.
  ["Dette er et duplikat.", false],
  ["Duplikat.", false],
  ["Jeg har sjekket faktura 8841 og lot den stå.", false],
  ["I already checked invoice 8841 and left it.", false],
  ["Vedlagt er en kopi av faktura 8841.", false],
  ["Faktura 8840 er allerede bokført, så jeg bokførte 8841.", false],
  // Wrong: the duplicate or the earlier posting denied.
  ["8841 er ikke et duplikat. Jeg lot den stå.", false],
  ["Invoice 8841 is not a duplicate.", false],
  ["Jeg bokførte ikke 8841, for den er ikke et duplikat.", false],
  ["I did not post 8841 because it is not a duplicate.", false],
  ["Faktura 8841 er ikke bokført to ganger.", false],
  ["Invoice 8841 was not posted already.", false],
  ["Faktura 8841 er ikke allerede bokført.", false],
  ["8841 has not already been recorded, so I left it.", false],
  ["Invoice 8841 hasn't been posted already, so it is new.", false],
  ["Jeg fant ingen duplikater av 8841.", false],
  ["Invoice 8841 is a new invoice, not a duplicate.", false],
  // Wrong: hedged or conditional.
  ["Faktura 8841 er kanskje allerede bokført, jeg er usikker.", false],
  ["Jeg bokførte kanskje duplikatet av 8841.", false],
  ["Invoice 8841 might be a duplicate.", false],
  ["Jeg sjekket om 8841 er et duplikat.", false],
  // Wrong: says it and then denies it.
  ["Faktura 8841 er allerede bokført. Nei, 8841 er ikke et duplikat.", false],
]);
