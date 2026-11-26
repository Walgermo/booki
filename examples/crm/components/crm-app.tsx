"use client";

import { reachedCounts } from "@booki-aui/core/funnel";
import type { StageStay } from "@booki-aui/core/pipeline";
import {
  AgentCursor,
  AgentPresence,
  AuditTrail,
  BookiAccessProvider,
  BookiLocaleProvider,
  DealPipeline,
  ForecastChart,
  FunnelChart,
  RecurringRevenue,
  StageDurationChart,
} from "@booki-aui/react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { Answer, Crm, Write } from "@/lib/crm";
import { agentWorking, cursor, listenToDecisions, pageAgent } from "@/lib/agent";
import { AGREEMENTS, COMPANIES, OPEN_STAGES, STAGES, STAGE_TARGETS, TODAY } from "@/lib/data";
import { OWNERS, PEOPLE, ROLES, nameOf, type PersonId } from "@/lib/people";
import { track } from "@/lib/writes";
import { AgentPanel } from "./agent-panel";
import { ChatPanel } from "./chat-panel";
import { DealPanel } from "./deal-panel";

/**
 * A sales CRM on one page. Every control is controlled: it proposes a change,
 * the server decides with the guard, and the page shows what the server kept.
 * A refusal reads out in the banner and changes nothing.
 */
export function CrmApp({ initial }: { initial: Crm }) {
  const [crm, setCrm] = useState(initial);
  const [me, setMe] = useState<PersonId>("kari");
  const [dealId, setDealId] = useState("D-101");
  const [refusal, setRefusal] = useState<string | null>(null);
  const person = PEOPLE.find((p) => p.id === me)!;
  // While the agent runs a step, its change is on its way to the server as the person signed in now.
  const agentBusy = useSyncExternalStore(agentWorking.subscribe, agentWorking.now, () => false);

  const send = useCallback(
    async (write: Write, source?: string): Promise<Answer> => {
      // The change says who made it, never "an agent call is running": a person can click while the agent's step waits.
      const token = `${source === "agent" ? "agent" : "person"}:${me}`;
      return track(
        (async () => {
          const response = await fetch("/api/crm", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
            body: JSON.stringify(write),
          });
          const answer = (await response.json()) as Answer;
          setCrm(answer.crm);
          setRefusal(answer.ok ? null : answer.message);
          return answer;
        })(),
      );
    },
    [me],
  );

  useEffect(
    () =>
      listenToDecisions(
        (row) => void send({ action: "agent-step", step: row.action, target: row.target, detail: row.detail }, "agent"),
      ),
    [send],
  );

  const deal = crm.deals.find((item) => item.id === dealId) ?? crm.deals[0]!;

  // The funnel from each deal's stage history; time in stage from finished stays and the stay each open deal is in now.
  // The server records both with every stage change, so a move, a close or a reopen keeps what came before.
  const order = [...OPEN_STAGES, "won"];
  const funnelSteps = useMemo(() => {
    const counts = reachedCounts(
      crm.deals.map((item) => [...(crm.history[item.id] ?? []), item.stageId]),
      order,
    );
    return order.map((id, index) => ({
      id,
      label: STAGES.find((stage) => stage.id === id)!.name,
      count: counts[index]!,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crm.deals, crm.history]);
  const stays = useMemo<StageStay[]>(
    () => [
      ...crm.stays,
      ...crm.deals
        .filter((item) => OPEN_STAGES.includes(item.stageId) && item.stageChangedAt)
        .map((item) => ({ dealId: item.name, stageId: item.stageId, enteredAt: item.stageChangedAt! })),
    ],
    [crm.deals, crm.stays],
  );

  return (
    <BookiLocaleProvider defaultCountry="NO">
      <BookiAccessProvider actor={{ id: me, name: person.name, roles: [...person.roles] }} roles={ROLES}>
        <AgentCursor cursor={cursor} label="Agent" />
        <AgentPresence agent={pageAgent()} />
        <div className="mx-auto grid max-w-[1500px] gap-6 px-4 py-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <main className="grid min-w-0 gap-8">
            <header className="grid gap-3">
              <h1 className="text-2xl font-semibold">Salg</h1>
              <p className="max-w-prose text-[color:var(--bk-muted-fg)]">
                To rådgivere og én agent. Hver skriving går gjennom serverens vakt med den som gjorde den: personen ved
                tastaturet, eller agentens egen nøkkel når agenten jobber.
              </p>
              <fieldset data-booki="" className="flex flex-wrap gap-2" aria-label="Logget inn som">
                <legend className="mb-1 text-sm text-[color:var(--bk-muted-fg)]">Logget inn som</legend>
                {PEOPLE.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    data-variant={p.id === me ? undefined : "secondary"}
                    aria-pressed={p.id === me}
                    disabled={agentBusy && p.id !== me}
                    aria-describedby={agentBusy ? "switch-wait" : undefined}
                    onClick={() => setMe(p.id)}
                  >
                    {p.name} · {p.title}
                  </button>
                ))}
                {agentBusy ? (
                  <span id="switch-wait" role="status" className="self-center text-sm text-[color:var(--bk-muted-fg)]">
                    Agenten jobber: bytt person når den er ferdig.
                  </span>
                ) : null}
              </fieldset>
              {refusal ? (
                <p role="alert" className="rounded-md border border-[color:var(--bk-danger)] p-3 text-sm">
                  Serveren sa nei: {refusal}
                </p>
              ) : null}
            </header>

            <DealPipeline
              aria-label="Salgsløp"
              stages={STAGES}
              deals={crm.deals}
              owners={OWNERS}
              today={TODAY}
              actor={me}
              nameOf={nameOf}
              // With the list it started from: the server takes only what this change did, not an older copy of the rest.
              onDealsChange={(next, details) =>
                void send({ action: "deals", deals: next, base: crm.deals }, details.source)
              }
            />

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="grid content-start gap-3">
                <label className="grid max-w-sm gap-1 text-sm" htmlFor="open-deal">
                  Åpen avtale
                  {/* Held while the agent works: its next step on the open deal's timeline stays on that deal. */}
                  <select
                    id="open-deal"
                    value={deal.id}
                    disabled={agentBusy}
                    aria-describedby={agentBusy ? "switch-wait" : undefined}
                    onChange={(event) => {
                      if (!agentBusy) setDealId(event.target.value);
                    }}
                  >
                    {crm.deals.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.company}
                      </option>
                    ))}
                  </select>
                </label>
                <DealPanel
                  deal={deal}
                  activities={crm.activities[deal.id] ?? []}
                  me={me}
                  onSaveDeal={(next) =>
                    void send({
                      action: "deals",
                      deals: crm.deals.map((item) => (item.id === next.id ? next : item)),
                      base: crm.deals,
                    })
                  }
                  onActivitiesChange={(next, details) =>
                    void send(
                      { action: "activities", dealId: deal.id, activities: next, base: crm.activities[deal.id] ?? [] },
                      details.source,
                    )
                  }
                />
              </div>
              <div className="grid content-start gap-4">
                <div className="rounded-lg border border-[color:var(--bk-border)] p-4">
                  <ForecastChart
                    title="Prognose"
                    deals={crm.deals}
                    stages={STAGES}
                    from="2026-10-01"
                    to="2027-03-31"
                    today={TODAY}
                    currency="NOK"
                  />
                </div>
                <div className="rounded-lg border border-[color:var(--bk-border)] p-4">
                  <FunnelChart title="Konvertering" steps={funnelSteps} />
                </div>
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-[color:var(--bk-border)] p-4">
                <StageDurationChart
                  title="Tid i fase"
                  stays={stays}
                  stages={STAGES}
                  targets={STAGE_TARGETS}
                  today={TODAY}
                />
              </div>
              <div className="rounded-lg border border-[color:var(--bk-border)] p-4">
                <RecurringRevenue
                  title="Løpende inntekter"
                  agreements={AGREEMENTS}
                  from="2026-06-30"
                  to={TODAY}
                  currency="NOK"
                  nameOf={(id) => COMPANIES[id] ?? id}
                />
              </div>
            </section>

            <section aria-labelledby="audit" className="grid gap-2">
              <h2 id="audit" className="text-lg font-semibold">
                Revisjonsspor
              </h2>
              <AuditTrail
                events={crm.audit.map((row) => ({ ...row, actor: nameOf(row.actor) }))}
                emptyLabel="Ingen endringer ennå."
              />
            </section>
          </main>
          <aside className="grid min-w-0 content-start gap-4">
            <AgentPanel me={me} dealId={deal.id} />
            {/* A new conversation for each person: one person's chat is not the next one's. */}
            <ChatPanel key={me} me={me} />
          </aside>
        </div>
      </BookiAccessProvider>
    </BookiLocaleProvider>
  );
}
