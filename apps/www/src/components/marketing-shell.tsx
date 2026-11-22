import { TextLink } from "@booki/react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { BookiLogo } from "@/components/booki-logo";
import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { useLang } from "@/lib/lang";

const REPO_URL = "https://github.com/Walgermo/booki";
const AUTHOR_URL = "https://github.com/Walgermo";

/** The launch post, linked from the badge under the logo. */
export const ANNOUNCEMENT_PATH = "/announcing-agent-first-ui-with-booki";

export function MarketingShell() {
  const { t } = useLang();
  const { pathname } = useLocation();
  const onPost = pathname.replace(/\/$/, "") === ANNOUNCEMENT_PATH;
  return (
    <div className="landing min-h-svh bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-5 md:px-8">
        {/* Only the mark: the page is the pitch. The links and toggles live in the footer. */}
        <header className="flex flex-col items-center justify-center gap-3 py-5">
          <Link to="/" className="site-mark" aria-label={t("Booki, home", "Booki, forsiden")}>
            <BookiLogo />
          </Link>
          {/* The launch post, one quiet line under the mark; not on the post itself. */}
          {onPost ? null : (
            <Link to={ANNOUNCEMENT_PATH} className="site-news">
              <span className="site-news__tag">{t("New", "Nytt")}</span>
              <span className="site-news__text">
                {t("Announcing agent-first UI with Booki", "Vi lanserer agent-first UI med Booki")}
              </span>
              <span aria-hidden="true" className="site-news__arrow">
                →
              </span>
            </Link>
          )}
        </header>
        <Outlet />
        <footer
          className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-sm text-muted-foreground"
          style={{ borderTop: "var(--hairline) solid var(--bk-border-strong)" }}
        >
          <p className="m-0">
            {t("Open source, MIT. Made by", "Åpen kildekode, MIT. Laget av")}{" "}
            <a href={AUTHOR_URL} target="_blank" rel="noreferrer" className="site-link">
              Stian Walgermo
            </a>
            .
          </p>
          {/* Only what a visitor needs from here: the docs, the code, language and theme. */}
          <nav aria-label={t("Footer", "Bunntekst")} className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <TextLink asChild icon="docs">
              <Link to="/docs">Docs</Link>
            </TextLink>
            <TextLink href={REPO_URL} target="_blank" rel="noreferrer" icon="github">
              GitHub
            </TextLink>
            <LangToggle />
            <ThemeToggle />
          </nav>
        </footer>
      </div>
    </div>
  );
}
