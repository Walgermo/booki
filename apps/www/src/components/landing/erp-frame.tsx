import { Button } from "@ui-sdk/react/button";
import type { KeyboardEvent, ReactNode } from "react";

import { useLang } from "@/lib/lang";

/** A browser tab in the demo window. Each one opens a demo, so the tabs are real. */
export type FrameTab = {
  id: string;
  title: string;
  active: boolean;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

/**
 * The demo app's window: a Chrome window on macOS around Kvadruptex, the made-up
 * business suite the landing demos run in. The browser's tabs switch between the
 * demos; the rest of the chrome is decorative and hidden from assistive tech.
 */
export function ErpFrame({
  label,
  tabs,
  path,
  search,
  nav,
  activeNav,
  counts = {},
  children,
}: {
  label: string;
  tabs: FrameTab[];
  path: string;
  search: string;
  nav: string[];
  activeNav: string;
  counts?: Record<string, number>;
  children: ReactNode;
}) {
  const { t } = useLang();
  return (
    <div className="erp-stage">
      <div className="erp-window" role="group" aria-label={label}>
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
                  <KvadruptexMark className="erp-chrome__favicon" muted={!tab.active} />
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
                <span className="erp-chrome__host">kvadruptex.example</span>
                {path}
              </span>
            </span>
            <span className="erp-chrome__profile">AA</span>
          </div>
        </div>

        <div className="erp-app">
          <div className="erp-app__top">
            <span className="erp-app__logo">
              <KvadruptexMark className="erp-app__mark" />
              <span className="erp-app__word">
                Kvadrup<span>tex</span>
              </span>
            </span>
            <span className="erp-app__search">
              {search}
              <kbd>⌘K</kbd>
            </span>
            <span className="erp-app__company">
              Analog Angst AS
              <span>{t("Fiscal year 2026 · Oslo", "Regnskapsår 2026 · Oslo")}</span>
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
