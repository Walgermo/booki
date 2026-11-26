import { Button } from "@ui-sdk/react/button";
import { useRef, useState, type KeyboardEvent, type RefObject } from "react";

import { useLang } from "@/lib/lang";
import { ErpWindow } from "./agentify-erp";
import { CrmWindow } from "./crm-window";
import type { LandingAgent } from "./shared";

type Slide = "invoice" | "crm";
const SLIDES: Slide[] = ["invoice", "crm"];

/**
 * The homepage demos, one at a time: the invoice in an accounting app first, the deal
 * in a CRM next. It never turns by itself; the visitor picks a slide with the tabs, the
 * arrows beside them, or the arrow keys on a tab. Only the shown slide is mounted, so the
 * agent's snapshot holds one demo's controls.
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
  const tabs = useRef<Record<Slide, HTMLButtonElement | null>>({ invoice: null, crm: null });
  const index = SLIDES.indexOf(slide);
  const label = (s: Slide) => (s === "invoice" ? t("Accounting app", "Regnskapssystem") : "CRM");
  // The tab's name for an agent and a screen reader: a verb makes it unique on the page,
  // where "CRM" alone also matches the CRM demo's own controls.
  const action = (s: Slide) =>
    s === "invoice" ? t("Show the accounting demo", "Vis regnskapsdemoen") : t("Show the CRM demo", "Vis CRM-demoen");

  function go(next: Slide, focus = false) {
    setSlide(next);
    if (focus) tabs.current[next]?.focus();
  }
  const step = (by: number) => SLIDES[(index + by + SLIDES.length) % SLIDES.length] as Slide;

  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowRight") go(step(1), true);
    else if (event.key === "ArrowLeft") go(step(-1), true);
    else if (event.key === "Home") go(SLIDES[0] as Slide, true);
    else if (event.key === "End") go(SLIDES[SLIDES.length - 1] as Slide, true);
    else return;
    event.preventDefault();
  }

  return (
    <div
      className="demo-carousel"
      role="region"
      aria-roledescription={t("carousel", "karusell")}
      aria-label={t("Booki demos", "Booki-demoer")}
    >
      <div className="demo-carousel__bar">
        <Button
          type="button"
          className="demo-carousel__arrow"
          aria-label={t(`Previous demo: ${label(step(-1))}`, `Forrige demo: ${label(step(-1))}`)}
          onClick={() => go(step(-1))}
        >
          <Chevron d="M10 3 5 8l5 5" />
        </Button>
        <div className="demo-carousel__tabs" role="tablist" aria-label={t("Demos", "Demoer")}>
          {SLIDES.map((s) => (
            <Button
              key={s}
              ref={(el) => {
                tabs.current[s] = el;
              }}
              type="button"
              role="tab"
              id={`demo-tab-${s}`}
              aria-selected={slide === s}
              aria-controls={`demo-panel-${s}`}
              aria-label={action(s)}
              tabIndex={slide === s ? 0 : -1}
              className="demo-carousel__tab"
              onClick={() => go(s)}
              onKeyDown={onKey}
            >
              {label(s)}
            </Button>
          ))}
        </div>
        <Button
          type="button"
          className="demo-carousel__arrow"
          aria-label={t(`Next demo: ${label(step(1))}`, `Neste demo: ${label(step(1))}`)}
          onClick={() => go(step(1))}
        >
          <Chevron d="m6 3 5 5-5 5" />
        </Button>
        <span className="demo-carousel__count" aria-hidden="true">
          {index + 1} / {SLIDES.length}
        </span>
      </div>

      <div
        key={slide}
        id={`demo-panel-${slide}`}
        role="tabpanel"
        aria-labelledby={`demo-tab-${slide}`}
        aria-roledescription={t("slide", "lysbilde")}
        className="demo-carousel__panel"
      >
        {slide === "invoice" ? <ErpWindow agent={agent} from={from} to={to} /> : <CrmWindow agent={agent} />}
      </div>
    </div>
  );
}

function Chevron({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
