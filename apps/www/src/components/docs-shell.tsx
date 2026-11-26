import { BookiLogo } from "@/components/booki-logo";
import { Icon } from "@booki-aui/icons/react";
import { BookiLocaleProvider } from "@booki-aui/react";
import type { CountryCode } from "@booki-aui/core/locale";
import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";

import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useLang } from "@/lib/lang";

import { catalog } from "../catalog";
import { catalogText } from "../catalog-nb";
import { NAV_SECTIONS, PAGE_ICON, plainName } from "../docs-nav";
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
    <div className="site-docnav">
      {NAV_SECTIONS.map((section) => (
        <section key={section.id} className="site-docnav__section" aria-labelledby={`docnav-${section.id}`}>
          <h2 id={`docnav-${section.id}`} className="site-kicker site-docnav__heading">
            {lang === "nb" ? section.nb : section.en}
          </h2>
          <ul className="site-docnav__list">
            {section.pages.map((name) => {
              const item = catalog.find((entry) => entry.name === name);
              if (!item) return null;
              return (
                <li key={name}>
                  <NavLink to={docPath(name)} end={name === "introduction"} className="site-nav-link site-docnav-link">
                    {PAGE_ICON[name] ? <Icon name={PAGE_ICON[name]} className="site-docnav-icon" /> : null}
                    <span>{plainName(name, lang) ?? catalogText(item, lang).title}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
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
        <header className="docs-header flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3">
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

        <div className="grid gap-x-12 lg:grid-cols-[13rem_minmax(0,1fr)]">
          {/* Phones: the page list is long, so it waits behind a disclosure. */}
          <details className="landing-details border-b border-border lg:hidden">
            <summary>{t("Browse the docs", "Bla i dokumentasjonen")}</summary>
            <nav aria-label={t("Docs", "Dokumentasjon")} className="pb-4">
              <NavGroups />
            </nav>
          </details>
          <nav
            aria-label={t("Docs", "Dokumentasjon")}
            className="docs-sidebar hidden lg:block lg:self-start lg:overflow-y-auto lg:py-10"
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
