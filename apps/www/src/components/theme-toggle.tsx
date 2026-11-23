import { Toggle } from "@ui-sdk/react/toggle";
import { useEffect, useState } from "react";

import { useLang } from "@/lib/lang";

const KEY = "booki-theme";
type Theme = "light" | "dark";

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function stored(): Theme | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

function apply(theme: Theme) {
  if (theme === "dark") document.documentElement.setAttribute("data-bk-theme", "dark");
  else document.documentElement.removeAttribute("data-bk-theme");
  // The browser's bar (the status bar on a phone) takes the theme's colour, kept on the tags in index.html.
  const bars = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  const color = [...bars].find((bar) => bar.dataset.scheme === theme)?.dataset.color;
  if (color) for (const bar of bars) bar.content = color;
}

/**
 * Paper or Night for the whole site. Follows the system until a person picks
 * one; the choice is kept in this browser. index.html applies it before the
 * first paint, so a reload does not flash.
 */
export function ThemeToggle() {
  const { t } = useLang();
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.getAttribute("data-bk-theme") === "dark" ? "dark" : "light",
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => {
      if (stored()) return;
      const next = systemTheme();
      apply(next);
      setTheme(next);
    };
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);

  // A ui-sdk Toggle: aria-pressed for people, and an agent can switch the
  // site's theme over the bridge like any other control.
  return (
    <Toggle
      className="site-nav-link site-text-button site-theme-toggle site-icon-toggle"
      aria-label={t("Night theme", "Natt-tema")}
      pressed={theme === "dark"}
      onPressedChange={(pressed) => {
        const next: Theme = pressed ? "dark" : "light";
        apply(next);
        setTheme(next);
        try {
          window.localStorage.setItem(KEY, next);
        } catch {
          /* private mode: the choice lasts this page view */
        }
      }}
    >
      {theme === "dark" ? (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="site-icon-toggle__icon"
        >
          <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="site-icon-toggle__icon"
        >
          <path
            d="M13.5 9.6A5.75 5.75 0 0 1 6.4 2.5a5.75 5.75 0 1 0 7.1 7.1Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
        </svg>
      )}
      <span>{theme === "dark" ? t("Paper", "Papir") : t("Night", "Natt")}</span>
    </Toggle>
  );
}
