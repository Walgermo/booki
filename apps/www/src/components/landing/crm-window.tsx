import {
  ActivityTimeline,
  BookiLocaleProvider,
  DealPipeline,
  type Activity,
  type Deal,
  type PipelineStage,
} from "@booki-aui/react";
import { useEffect, useRef, useState } from "react";

import { whenCursorFree } from "@/agent";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang";
import { ErpFrame, type FrameTab, type OtherDemo } from "./erp-frame";
import { wait, type ActResult, type LandingAgent } from "./shared";

/** Agent labels: unique on the landing page, so the agent's refs find these. */
const PIPELINE = "CRM-salgsløp";
const TIMELINE = "CRM-aktivitet";
const TODAY = "2026-11-24";

const NAV = ["Oversikt", "Salg", "Kunder", "Aktiviteter", "Rapporter"];
const OWNERS = [
  { id: "kari", name: "Kari Nordmann" },
  { id: "ola", name: "Ola Hansen" },
];

type Phase = "idle" | "running" | "done";

/** A sales pipeline in A-CRM, a made-up agentic CRM: after a meeting, the agent updates the deal. */
export function CrmWindow({
  agent,
  tabs,
  other,
  autoRun = false,
}: {
  agent: LandingAgent;
  tabs: FrameTab[];
  other: OtherDemo;
  /** Run as soon as it is shown: the visitor pressed this demo's button on the other one. */
  autoRun?: boolean;
}) {
  const { t } = useLang();
  const stages: PipelineStage[] = [
    { id: "kvalifisering", name: t("Qualifying", "Kvalifisering"), probability: 10 },
    { id: "tilbud", name: t("Proposal sent", "Tilbud sendt"), probability: 50 },
    { id: "forhandling", name: t("Negotiation", "Forhandling"), probability: 70 },
    { id: "vunnet", name: t("Won", "Vunnet"), probability: 100, outcome: "won" },
    { id: "tapt", name: t("Lost", "Tapt"), probability: 0, outcome: "lost" },
  ];
  const [deals, setDeals] = useState<Deal[]>(() => seedDeals());
  const [activities, setActivities] = useState<Activity[]>(() => seedActivities(t));
  const [phase, setPhase] = useState<Phase>("idle");
  const active = useRef(false);

  /** One agent step, then a beat for the eye. */
  async function step(ref: string, action: string, args: unknown[]) {
    const result = (await agent.act({ steps: [{ ref, action, args }] } as never)) as ActResult;
    await wait(520);
    return result;
  }

  async function run() {
    if (active.current) return;
    active.current = true;
    setPhase("running");
    // Start from the same deal each time, so the demo can be run again.
    setDeals(seedDeals());
    setActivities(seedActivities(t));
    await wait(200);
    await whenCursorFree();
    await step(PIPELINE, "moveDeal", ["D-1", "forhandling"]);
    await step(PIPELINE, "setValue", [
      "D-1",
      {
        valueMinor: 195_000_00,
        currency: "NOK",
        valueStatus: "known",
        valueSource: t("Revised quote 2026-121", "Revidert tilbud 2026-121"),
      },
    ]);
    await step(TIMELINE, "logActivity", [
      {
        kind: "meeting",
        subject: t("Went through the quote", "Gjennomgang av tilbudet"),
        at: `${TODAY}T13:00:00Z`,
        evidence: t("Calendar 24 Nov", "Kalender 24. nov."),
      },
    ]);
    await step(TIMELINE, "scheduleTask", [
      { subject: t("Send the revised agreement", "Send revidert avtale"), dueDate: "2026-11-27", assigneeId: "kari" },
    ]);
    setPhase("done");
    active.current = false;
  }

  // Opened from the other demo's button: run once, as if this demo's own button was pressed.
  useEffect(() => {
    if (autoRun) void run();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- on mount only
  }, []);

  const status =
    phase === "running"
      ? t("Agent working", "Agenten jobber")
      : phase === "done"
        ? t("Updated", "Oppdatert")
        : t("Agent ready", "Agenten er klar");

  return (
    <section id="crm-demo" aria-labelledby="crm-demo-title" className="grid scroll-mt-6 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h2 id="crm-demo-title" className="m-0 text-lg font-semibold">
            {t("Booki in a CRM", "Booki i et CRM")}
          </h2>
          <p className="m-0 max-w-[58ch] text-sm text-muted-foreground">
            {t(
              "After a meeting, watch the agent move the deal to negotiation, record the new value with its source, log the meeting and set a follow-up.",
              "Etter et møte: se agenten flytte avtalen til forhandling, føre den nye verdien med kilde, logge møtet og sette en oppfølging.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="lg" disabled={phase === "running"} onClick={other.onRun}>
            {other.label}
          </Button>
          <Button variant="outline" size="lg" disabled={phase === "running"} onClick={() => void run()}>
            {phase === "running"
              ? t("Agent working…", "Agenten jobber …")
              : phase === "idle"
                ? t("Run CRM demo", "Kjør CRM-demoen")
                : t("Run again", "Kjør på nytt")}
          </Button>
        </div>
      </div>
      <ErpFrame
        brand="acrm"
        label={t("Demo CRM", "Demo-CRM")}
        tabs={tabs}
        path="/analog-angst/salg"
        search={t("Search deals, customers …", "Søk i avtaler, kunder …")}
        nav={NAV}
        activeNav="Salg"
        counts={{ Aktiviteter: 2 }}
      >
        <BookiLocaleProvider country="NO">
          <header className="erp-doc">
            <div className="grid gap-1">
              <p className="erp-window__crumb">{t("Sales / Pipeline", "Salg / Salgsløp")}</p>
              <h2 className="erp-doc__title">
                {t("Accounting licence 2027", "Regnskapslisens 2027")}
                <span className="erp-window__state" data-phase={phase === "done" ? "posted" : phase} role="status">
                  {status}
                </span>
              </h2>
              <p className="erp-doc__party">Fjordkraft Bygg AS · Kari Nordmann</p>
            </div>
          </header>

          <div className="erp-doc__lines landing-scroll">
            <DealPipeline
              stages={stages}
              deals={deals}
              onDealsChange={setDeals}
              owners={OWNERS}
              today={TODAY}
              actor="kari"
              aria-label={PIPELINE}
            />
          </div>

          <div className="erp-doc__lines landing-scroll">
            <ActivityTimeline
              activities={activities}
              onActivitiesChange={setActivities}
              people={OWNERS}
              today={TODAY}
              actor="kari"
              aria-label={TIMELINE}
            />
          </div>
        </BookiLocaleProvider>

        <footer className="erp-doc__foot">
          {phase === "done" ? (
            <span className="erp-window__posted">
              {t(
                "Updated by the agent · marking the deal won is yours",
                "Oppdatert av agenten · å markere avtalen vunnet er ditt",
              )}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {t(
                "The agent updates deals and activities. Winning or losing a deal stays with a person.",
                "Agenten oppdaterer avtaler og aktiviteter. Å vinne eller tape en avtale er en persons valg.",
              )}
            </span>
          )}
        </footer>
      </ErpFrame>
    </section>
  );
}

function seedDeals(): Deal[] {
  return [
    {
      id: "D-1",
      name: "Regnskapslisens 2027",
      company: "Fjordkraft Bygg AS",
      stageId: "tilbud",
      valueMinor: 180_000_00,
      currency: "NOK",
      valueStatus: "known",
      valueSource: "Tilbud 2026-114",
      ownerId: "kari",
      expectedClose: "2026-12-15",
      stageChangedAt: "2026-11-10T09:00:00Z",
    },
    {
      id: "D-2",
      name: "Lønnstjenester",
      company: "Nordlys Logistikk AS",
      stageId: "kvalifisering",
      valueMinor: 60_000_00,
      currency: "NOK",
      valueStatus: "unknown",
      ownerId: "ola",
      expectedClose: "2027-01-31",
      stageChangedAt: "2026-11-02T09:00:00Z",
    },
    {
      id: "D-3",
      name: "Årsoppgjør 2026",
      company: "Havbris Eiendom AS",
      stageId: "forhandling",
      valueMinor: 95_000_00,
      currency: "NOK",
      valueStatus: "estimate",
      valueSource: "Samtale 12. nov.",
      ownerId: "kari",
      expectedClose: "2026-12-05",
      stageChangedAt: "2026-11-12T09:00:00Z",
    },
  ];
}

function seedActivities(t: (en: string, nb: string) => string): Activity[] {
  return [
    {
      id: "A-1",
      kind: "email",
      subject: t("Sent quote 2026-114", "Sendte tilbud 2026-114"),
      at: "2026-11-10T08:30:00Z",
      by: "kari",
    },
    {
      id: "A-2",
      kind: "call",
      subject: t("Followed up the quote", "Oppfølging av tilbudet"),
      at: "2026-11-18T10:15:00Z",
      by: "kari",
    },
  ];
}
