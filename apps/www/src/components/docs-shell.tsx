import { BookiLogo } from "@/components/booki-logo";
import { BookiLocaleProvider } from "@booki-aui/react";
import type { CountryCode } from "@booki-aui/core/locale";
import { useState } from "react";
import { Link, Outlet } from "react-router-dom";

import { DocsNavigation } from "@/components/docs-navigation";
import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useLang } from "@/lib/lang";

const REPO_URL = "https://github.com/Walgermo/booki";

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
              <DocsNavigation />
            </nav>
          </details>
          <nav
            aria-label={t("Docs", "Dokumentasjon")}
            className="docs-sidebar hidden lg:block lg:self-start lg:overflow-y-auto lg:py-10"
          >
            <DocsNavigation />
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
