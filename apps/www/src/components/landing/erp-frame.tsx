import { Button } from "@ui-sdk/react/button";
import type { KeyboardEvent, ReactNode } from "react";

import { useLang } from "@/lib/lang";

/**
 * The made-up products the demos run in, each with its own name and mark:
 * Kvadruptex, an ERP that checks everything four times, and A-CRM, an agentic CRM.
 */
export type Brand = "kvadruptex" | "acrm";
const BRANDS: Record<Brand, { head: string; tail: string; host: string }> = {
  kvadruptex: { head: "Kvadrup", tail: "tex", host: "kvadruptex.example" },
  acrm: { head: "A-", tail: "CRM", host: "a-crm.example" },
};

/** The button beside a demo's own Run button that opens the other demo and runs it. */
export type OtherDemo = { label: string; onRun: () => void };

/** A browser tab in the demo window. Each one opens a demo, so the tabs are real. */
export type FrameTab = {
  id: string;
  brand: Brand;
  title: string;
  active: boolean;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

/**
 * The demo app's window: a Chrome window on macOS around one of the made-up
 * products the landing demos run in. The browser's tabs switch between the
 * demos; the rest of the chrome is decorative and hidden from assistive tech.
 */
export function ErpFrame({
  brand,
  label,
  context,
  tabs,
  path,
  search,
  nav,
  activeNav,
  counts = {},
  children,
}: {
  brand: Brand;
  label: string;
  /** The line under the company name in the app's top bar, such as the fiscal year. */
  context: string;
  tabs: FrameTab[];
  path: string;
  search: string;
  nav: string[];
  activeNav: string;
  counts?: Record<string, number>;
  children: ReactNode;
}) {
  const { t } = useLang();
  const name = BRANDS[brand];
  return (
    <div className="erp-stage">
      <div className="erp-window" data-brand={brand} role="group" aria-label={label}>
        <div className="erp-chrome">
          <div className="erp-chrome__tabs">
            <span className="erp-chrome__lights" aria-hidden="true">
              <i data-light="close" />
              <i data-light="min" />
              <i data-light="max" />
            </span>
            <div className="erp-chrome__tablist" role="tablist" aria-label={t("Demos", "Demoer")}>
              {tabs.map((tab) => (
                <Button
                  key={tab.id}
                  type="button"
                  role="tab"
                  id={`demo-tab-${tab.id}`}
                  aria-selected={tab.active}
                  aria-controls={`demo-panel-${tab.id}`}
                  tabIndex={tab.active ? 0 : -1}
                  className="erp-chrome__tab"
                  data-active={tab.active ? "" : undefined}
                  onClick={tab.onSelect}
                  onKeyDown={tab.onKeyDown}
                >
                  <BrandMark brand={tab.brand} className="erp-chrome__favicon" muted={!tab.active} />
                  <span className="erp-chrome__title">{tab.title}</span>
                  <span className="erp-chrome__close" aria-hidden="true">
                    ×
                  </span>
                </Button>
              ))}
            </div>
            <span className="erp-chrome__new" aria-hidden="true">
              +
            </span>
          </div>
          <div className="erp-chrome__toolbar" aria-hidden="true">
            <span className="erp-chrome__nav">
              <Icon d="M10 3 5 8l5 5" />
              <Icon d="m6 3 5 5-5 5" muted />
              <Icon d="M13 8a5 5 0 1 1-1.5-3.6M13 3v3h-3" />
            </span>
            <span className="erp-chrome__omnibox">
              <Icon d="M5 7V5a3 3 0 0 1 6 0v2M4 7h8v6H4z" small />
              <span>
                <span className="erp-chrome__host">{name.host}</span>
                {path}
              </span>
            </span>
            <span className="erp-chrome__profile">AA</span>
          </div>
        </div>

        <div className="erp-app">
          <div className="erp-app__top">
            <span className="erp-app__logo">
              <BrandMark brand={brand} className="erp-app__mark" />
              <span className="erp-app__word">
                {name.head}
                <span>{name.tail}</span>
              </span>
            </span>
            <span className="erp-app__search">
              {search}
              <kbd>⌘K</kbd>
            </span>
            <span className="erp-app__company">
              Analog Angst AS
              <span>{context}</span>
            </span>
            <span className="erp-app__avatar" aria-hidden="true">
              KN
            </span>
          </div>

          <div className="erp-window__body">
            <nav className="erp-window__nav" aria-label={t("App menu", "Appmeny")}>
              <ul>
                {nav.map((item) => (
                  <li key={item} data-active={item === activeNav ? "" : undefined}>
                    {item}
                    {counts[item] ? <span className="erp-window__count">{counts[item]}</span> : null}
                  </li>
                ))}
              </ul>
            </nav>
            <div className="erp-window__main">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Icon({ d, muted, small }: { d: string; muted?: boolean; small?: boolean }) {
  const size = small ? 12 : 16;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" data-muted={muted ? "" : undefined}>
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BrandMark({ brand, className, muted }: { brand: Brand; className?: string; muted?: boolean }) {
  return brand === "acrm" ? (
    <AcrmMark className={className} muted={muted} />
  ) : (
    <KvadruptexMark className={className} muted={muted} />
  );
}

/** A-CRM, the demo's made-up agentic CRM: a funnel in a green tile. */
function AcrmMark({ className, muted }: { className?: string; muted?: boolean }) {
  return (
    <svg className={className} data-muted={muted ? "" : undefined} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="var(--trk-green)" />
      <path
        d="M5.5 6.5h13l-5 6v4.6l-3 1.4v-6z"
        fill="none"
        stroke="var(--trk-on-green)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Kvadruptex, the demo's made-up ERP: one better than triple. The mark is four
 * ticks in a tile, for an ERP that checks everything four times. Drawn in the
 * page's tokens, so it follows the theme.
 */
function KvadruptexMark({ className, muted }: { className?: string; muted?: boolean }) {
  const tick = (x: number, y: number) => `M${x} ${y + 2.2}l1.8 1.8 3.4-3.6`;
  return (
    <svg className={className} data-muted={muted ? "" : undefined} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="var(--kvx-blue)" />
      <path
        d={[tick(4.6, 5), tick(13, 5), tick(4.6, 13.4), tick(13, 13.4)].join(" ")}
        fill="none"
        stroke="var(--kvx-on-blue)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
