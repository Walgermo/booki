"use client";

import {
  AgentCursor,
  AuditTrail,
  BankReconciliation,
  BookiAccessProvider,
  BookiLocaleProvider,
  PaymentBatch,
  SupplierInvoiceInbox,
} from "@booki-aui/react";
import { Button } from "@ui-sdk/react/button";
import { useCallback, useEffect, useState } from "react";
import { cursor, listenToDecisions } from "@/lib/agent";
import { openPosts, type Answer, type Books, type Write } from "@/lib/books";
import { CHART } from "@/lib/data";
import { PEOPLE, ROLES, nameOf, type PersonId } from "@/lib/people";
import { RULE_NAME, smallKnownSupplier } from "@/lib/rule";
import { track } from "@/lib/writes";
import { AgentPanel } from "./agent-panel";

const CHART_NUMBERS = CHART.map((account) => account.number);

/**
 * Supplier invoice to payment on one page. Each control is controlled: it
 * proposes a new value, the server decides, and the page shows what the
 * server kept. A refusal reads out in the banner and changes nothing.
 */
export function ApFlow({ initial }: { initial: Books }) {
  const [books, setBooks] = useState(initial);
  const [me, setMe] = useState<PersonId>("nina");
  const [refusal, setRefusal] = useState<string | null>(null);
  const person = PEOPLE.find((p) => p.id === me)!;

  const send = useCallback(
    async (write: Write, source?: string): Promise<Answer> => {
      // The change says who made it. Not "is an agent call running": a person can
      // click while the agent's step waits.
      const token = `${source === "agent" ? "agent" : "person"}:${me}`;
      return track(
        (async () => {
          const response = await fetch("/api/books", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
            body: JSON.stringify(write),
          });
          const answer = (await response.json()) as Answer;
          setBooks(answer.books);
          setRefusal(answer.ok ? null : answer.message);
          return answer;
        })(),
      );
    },
    [me],
  );

  // Steps refused in the page never become a write, so they are logged on their own.
  useEffect(
    () =>
      listenToDecisions((row) => void send({ action: "agent-step", step: row.action, target: row.target }, "agent")),
    [send],
  );

  const posts = openPosts(books);
  const approved = books.invoices.filter((invoice) => invoice.status === "approved").length;

  return (
    <BookiLocaleProvider defaultCountry="NO">
      <BookiAccessProvider actor={{ id: me, name: person.name, roles: [...person.roles] }} roles={ROLES}>
        <AgentCursor cursor={cursor} label="Agent" />
        <div className="mx-auto grid max-w-[1400px] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <main className="grid min-w-0 gap-8">
            <header className="grid gap-3">
              <h1 className="text-2xl font-semibold">Fra leverandørfaktura til betaling</h1>
              <p className="max-w-prose text-[color:var(--bk-muted-fg)]">
                Fire personer og én agent. Hver skriving går gjennom serverens vakt med den som gjorde den: personen ved
                tastaturet, eller agentens egen nøkkel når agenten jobber.
              </p>
              <fieldset className="flex flex-wrap gap-2" aria-label="Logget inn som">
                <legend className="mb-1 text-sm text-[color:var(--bk-muted-fg)]">Logget inn som</legend>
                {PEOPLE.map((p) => (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border border-[color:var(--bk-border)] px-3 py-2 text-sm has-[:checked]:border-[color:var(--bk-fg)]"
                  >
                    <input type="radio" name="me" value={p.id} checked={me === p.id} onChange={() => setMe(p.id)} />
                    <span>
                      <strong>{p.name}</strong>, {p.title.toLowerCase()}
                      <span className="block text-[color:var(--bk-muted-fg)]">{p.does}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {refusal ? (
                <p role="alert" className="rounded-md border border-[color:var(--bk-danger)] px-3 py-2 text-sm">
                  <strong>Serveren sa nei:</strong> {refusal}
                </p>
              ) : null}
            </header>

            <section aria-labelledby="step-inbox" className="grid gap-3">
              <h2 id="step-inbox" className="text-lg font-semibold">
                1. Innboks: kontering og attestasjon
              </h2>
              <SupplierInvoiceInbox
                invoices={books.invoices}
                onInvoicesChange={(invoices, { source }) => void send({ action: "invoices", invoices }, source)}
                chart={CHART_NUMBERS}
                actor={me}
                agentActor="agent:bookkeeper"
                rule={smallKnownSupplier}
                ruleName={RULE_NAME}
                aria-label="Leverandørfakturaer"
              />
            </section>

            <section aria-labelledby="step-batch" className="grid gap-3">
              <h2 id="step-batch" className="text-lg font-semibold">
                2. Betaling: forslag, godkjenning og frigivelse
              </h2>
              {books.batch ? (
                <PaymentBatch
                  batch={books.batch}
                  onBatchChange={(batch, { source }) => void send({ action: "batch", batch }, source)}
                  actor={me}
                  requiredApprovals={1}
                  nameOf={nameOf}
                  aria-label="Betalingsforslag"
                />
              ) : (
                <div data-booki="" className="grid justify-items-start gap-2">
                  <p className="text-sm text-[color:var(--bk-muted-fg)]">
                    {approved === 0
                      ? "Ingen fakturaer er attestert ennå. Betalingsforslaget lages av de attesterte."
                      : `${approved} attesterte fakturaer venter på et betalingsforslag.`}
                  </p>
                  <Button
                    disabled={approved === 0}
                    onClick={(_event, { source }) => void send({ action: "prepare-batch" }, source)}
                  >
                    Lag betalingsforslag
                  </Button>
                </div>
              )}
            </section>

            <section aria-labelledby="step-bank" className="grid gap-3">
              <h2 id="step-bank" className="text-lg font-semibold">
                3. Bank: avstemming mot kontoutskriften
              </h2>
              {books.bankLines.length > 0 ? (
                <BankReconciliation
                  bankLines={books.bankLines}
                  openPosts={posts}
                  matches={books.matches}
                  onMatchesChange={(matches, { source }) => void send({ action: "matches", matches }, source)}
                  aria-label="Bankavstemming"
                />
              ) : (
                <p className="text-sm text-[color:var(--bk-muted-fg)]">
                  Kontoutskriften kommer når betalingen er frigitt.
                </p>
              )}
            </section>
          </main>

          <aside className="grid content-start gap-6">
            <AgentPanel me={me} />
            <section aria-labelledby="audit" className="grid gap-2">
              <div className="flex items-baseline justify-between">
                <h2 id="audit" className="text-lg font-semibold">
                  Revisjonsspor
                </h2>
                <button type="button" className="text-sm underline" onClick={() => void send({ action: "reset" })}>
                  Start på nytt
                </button>
              </div>
              <AuditTrail
                events={books.audit.map((row) => ({
                  ...row,
                  actor: row.actor.startsWith("agent:") ? "Agenten" : nameOf(row.actor),
                }))}
                emptyLabel="Ingenting skrevet ennå."
              />
            </section>
          </aside>
        </div>
      </BookiAccessProvider>
    </BookiLocaleProvider>
  );
}
