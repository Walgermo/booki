import { BookiLogo } from "@/components/booki-logo";
import { useBookiLocale } from "@booki/react";
import { useEffect } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";

import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useLang } from "@/lib/lang";

import { catalog } from "../catalog";
import { catalogText, groupName } from "../catalog-nb";

const groups = ["Getting started", "Core", "React"] as const;
const REPO_URL = "https://github.com/Walgermo/booki";

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
                    to={item.name === "introduction" ? "/docs" : `/docs/${item.name}`}
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
  const { setCountry } = useBookiLocale();
  useEffect(() => setCountry(lang === "nb" ? "NO" : "US"), [lang, setCountry]);
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
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
