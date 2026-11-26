import { BookiLogo } from "@/components/booki-logo";
import { BookiLocaleProvider } from "@booki-aui/react";
import type { CountryCode } from "@booki-aui/core/locale";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";

import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useLang } from "@/lib/lang";

import { catalog } from "../catalog";
import { catalogText, groupName } from "../catalog-nb";

const groups = ["Getting started", "Core", "React"] as const;
const REPO_URL = "https://github.com/Walgermo/booki";

// These three pages live outside /docs; the /docs/* paths remain only as redirects for old links.
const REAL_PAGES: Record<string, string> = { demo: "/demo", "month-end": "/close", "erp-teams": "/erp-teams" };

function docPath(name: string): string {
  if (name === "introduction") return "/docs";
  return REAL_PAGES[name] ?? `/docs/${name}`;
}

function NavGroups() {
  const { lang } = useLang();
  return (
    <>
      {groups.map((group) => (
        <div key={group} className="mb-6 last:mb-0">
          <p className="site-kicker mb-2 lg:pl-3">{groupName(group, lang)}</p>
          <ul className="m-0 flex list-none flex-wrap gap-x-5 p-0 lg:block">
            {catalog
              .filter((item) => item.group === group)
              .map((item) => (
                <li key={item.name}>
                  <NavLink
                    to={docPath(item.name)}
                    end={item.name === "introduction"}
                    className="site-nav-link site-docnav-link lg:min-h-9"
                  >
                    {catalogText(item, lang).title}
                  </NavLink>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </>
  );
}

export function DocsShell() {
  const { lang, t } = useLang();
  // One switch, not two: the language picks the country profile the component
  // pages show (Norwegian: NO, kontonummer and MVA; English: US, ABA and sales tax).
  // Chosen during render, not in an effect, so the prerendered English HTML (and the
  // Markdown made from it) shows the same US controls as the live English page.
  // A pick on the CountryToggle page holds until the language changes, and is
  // dropped then: switching back to the first language shows its own country again.
  const [picked, setPicked] = useState<{ lang: string; country: CountryCode } | null>(null);
  if (picked && picked.lang !== lang) setPicked(null);
  const country: CountryCode = picked?.lang === lang ? picked.country : lang === "nb" ? "NO" : "US";
  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-5 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
          <Link to="/" className="site-mark" aria-label={t("Booki, home", "Booki, forsiden")}>
            <BookiLogo />
          </Link>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <LangToggle />
            <ThemeToggle />
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="site-nav-link">
              GitHub
            </a>
          </div>
        </header>

        <div
          className="grid gap-x-12 lg:grid-cols-[13rem_minmax(0,1fr)]"
          style={{ borderTop: "var(--hairline) solid var(--bk-border-strong)" }}
        >
          {/* Phones: the page list is long, so it waits behind a disclosure. */}
          <details className="landing-details border-b border-border lg:hidden">
            <summary>{t("Browse the docs", "Bla i dokumentasjonen")}</summary>
            <nav aria-label={t("Docs", "Dokumentasjon")} className="pb-4">
              <NavGroups />
            </nav>
          </details>
          <nav
            aria-label={t("Docs", "Dokumentasjon")}
            className="hidden lg:sticky lg:top-0 lg:block lg:max-h-svh lg:self-start lg:overflow-y-auto lg:py-10"
          >
            <NavGroups />
          </nav>
          <main className="min-w-0 py-8 lg:py-10">
            <BookiLocaleProvider country={country} onCountryChange={(next) => setPicked({ lang, country: next })}>
              <Outlet />
            </BookiLocaleProvider>
          </main>
        </div>
      </div>
    </div>
  );
}
