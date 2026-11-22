import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { CostCentre } from "./cost-centre";
import source from "./cost-centre.tsx?raw";
import { Section } from "@/components/section";
import { CodeDisclosure, TwoReaders } from "@/components/two-readers";
import { useLang } from "@/lib/lang";
import { type ActResult, type LandingAgent } from "./shared";

/** A control Booki does not ship, defined on this page and operated by the agent. */
export function Extend({ agent }: { agent: LandingAgent }) {
  const { t } = useLang();
  const [entry, setEntry] = useState("");
  const [answer, setAnswer] = useState("");

  useEffect(() => {
    const read = () =>
      setEntry(JSON.stringify(agent.snapshot().find((item) => item.component === "cost-centre") ?? null, null, 2));
    // Read after the bridge has finished notifying, never inside a change.
    let timer = 0;
    const later = () => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        read();
      }, 0);
    };
    later();
    const unsubscribe = agent.subscribe(later);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [agent]);

  async function set(code: string) {
    // Found by component, so the ref holds whichever language the label is in.
    const ref = agent.snapshot().find((item) => item.component === "cost-centre")?.ref ?? "Cost centre";
    const r = (await agent.act({
      steps: [{ ref, action: "setCostCentre", args: [code] }],
    } as never)) as ActResult;
    setAnswer(
      r.ok
        ? t(`Set to ${code}.`, `Satt til ${code}.`)
        : t(
            r.error?.message ?? "Refused",
            /^No (item|cost centre)/.test(r.error?.message ?? "")
              ? `Kostnadssted «${code}» finnes ikke. Gyldige verdier: 100 Salg, 420 Markedsføring og 700 Drift.`
              : (r.error?.message ?? "Avvist"),
          ),
    );
  }

  return (
    <Section
      id="extend-title"
      title={t("Extensible", "Utvidbart")}
      note={t(
        `Your own control joins the bridge. This one is ${source.trimEnd().split("\n").length} lines, and Booki does not ship it.`,
        `Deres egen kontroll kobles på broen. Denne er ${source.trimEnd().split("\n").length} linjer, og Booki leverer den ikke.`,
      )}
    >
      <div className="grid gap-6">
        <TwoReaders
          person={<CostCentre />}
          machine={entry}
          actions={
            <>
              <Button onClick={() => void set("420")}>setCostCentre("420")</Button>
              <Button variant="outline" onClick={() => void set("999")}>
                setCostCentre("999")
              </Button>
            </>
          }
          status={
            answer ||
            t(
              "Press an action: the agent calls it, the control answers.",
              "Trykk på en handling: agenten kaller den, og kontrollen svarer.",
            )
          }
        />
        <CodeDisclosure title="cost-centre.tsx" source={source} />
      </div>
    </Section>
  );
}
