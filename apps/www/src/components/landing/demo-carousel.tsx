import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";

import { useLang } from "@/lib/lang";
import { ErpWindow } from "./agentify-erp";
import type { FrameTab } from "./erp-frame";
import { CrmWindow } from "./crm-window";
import type { LandingAgent } from "./shared";

type Slide = "invoice" | "crm";
const SLIDES: Slide[] = ["invoice", "crm"];

/**
 * The homepage demos, one at a time: the invoice in an accounting app first, the deal
 * in a CRM next. It never turns by itself; the visitor opens a demo with the tabs of the
 * demo window's browser, or the arrow keys on a tab. Only the shown demo is mounted, so
 * the agent's snapshot holds one demo's controls.
 */
export function DemoCarousel({
  agent,
  from,
  to,
}: {
  agent: LandingAgent;
  from: RefObject<HTMLElement | null>;
  to: RefObject<HTMLElement | null>;
}) {
  const { t } = useLang();
  const [slide, setSlide] = useState<Slide>("invoice");
  // Set when the visitor runs the other demo from a demo's header: it runs once it is shown.
  const [autoRun, setAutoRun] = useState<Slide | null>(null);
  // The invoice demo's walkthrough from the hero title belongs to the first view only.
  const [switched, setSwitched] = useState(false);
  // The window remounts on a switch, so the new tab takes the focus once it is there.
  const refocus = useRef(false);

  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    document.getElementById(`demo-tab-${slide}`)?.focus();
  }, [slide]);

  function go(next: Slide, run = false) {
    if (next === slide) return;
    refocus.current = true;
    setSwitched(true);
    setAutoRun(run ? next : null);
    setSlide(next);
  }

  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = SLIDES.indexOf(slide);
    const at = (i: number) => SLIDES[(i + SLIDES.length) % SLIDES.length] as Slide;
    if (event.key === "ArrowRight") go(at(index + 1));
    else if (event.key === "ArrowLeft") go(at(index - 1));
    else if (event.key === "Home") go(at(0));
    else if (event.key === "End") go(at(SLIDES.length - 1));
    else return;
    event.preventDefault();
  }

  const tabs: FrameTab[] = SLIDES.map((s) => ({
    id: s,
    brand: s === "invoice" ? "kvadruptex" : "acrm",
    title:
      s === "invoice"
        ? t("New voucher – Kvadruptex", "Nytt bilag – Kvadruptex")
        : t("Pipeline – A-CRM", "Salgsløp – A-CRM"),
    active: s === slide,
    onSelect: () => go(s),
    onKeyDown: onKey,
  }));

  return (
    <div
      key={slide}
      id={`demo-panel-${slide}`}
      role="tabpanel"
      aria-labelledby={`demo-tab-${slide}`}
      className="demo-carousel__panel"
    >
      {slide === "invoice" ? (
        <ErpWindow
          agent={agent}
          from={from}
          to={to}
          tabs={tabs}
          walkthrough={!switched}
          autoRun={autoRun === "invoice"}
          other={{ label: t("Run CRM demo", "Kjør CRM-demo"), onRun: () => go("crm", true) }}
        />
      ) : (
        <CrmWindow
          agent={agent}
          tabs={tabs}
          autoRun={autoRun === "crm"}
          other={{ label: t("Run invoice demo", "Kjør fakturademo"), onRun: () => go("invoice", true) }}
        />
      )}
    </div>
  );
}
