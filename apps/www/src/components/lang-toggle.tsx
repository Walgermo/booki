import { Toggle } from "@ui-sdk/react/toggle";

import { useLang } from "@/lib/lang";

/**
 * EN or NO for the whole site. A ui-sdk Toggle: pressed means Norwegian, and
 * an agent can switch it like any other control. The label names the language
 * it switches to, in that language.
 */
export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <Toggle
      className="site-nav-link site-text-button site-icon-toggle"
      // The name holds the visible code too (WCAG 2.5.3), so voice control can say what it sees.
      aria-label={`Norsk (${lang === "nb" ? "EN" : "NO"})`}
      pressed={lang === "nb"}
      onPressedChange={(pressed) => setLang(pressed ? "nb" : "en")}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="site-icon-toggle__icon">
        <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M1.75 8h12.5M8 1.75c1.7 1.8 2.6 3.9 2.6 6.25S9.7 12.45 8 14.25C6.3 12.45 5.4 10.35 5.4 8S6.3 3.55 8 1.75Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
      <span lang={lang === "nb" ? "en" : "nb"}>{lang === "nb" ? "EN" : "NO"}</span>
    </Toggle>
  );
}
