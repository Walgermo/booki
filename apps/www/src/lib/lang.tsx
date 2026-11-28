import { useLocation } from "react-router-dom";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * The site's language: Norwegian when the browser asks for Norwegian (nb, nn
 * or no), English otherwise. A visitor's own pick (the EN/NO switch) wins and
 * is kept in this browser. index.html sets <html lang> before the first paint
 * with the same rule, so the page never flashes the other language's lang.
 */
export type Lang = "en" | "nb";

const KEY = "booki-lang";

/** Norwegian in any of its codes: nb (Bokmål), nn (Nynorsk), no. */
const NORWEGIAN = /^(nb|nn|no)\b/i;

export function browserLang(): Lang {
  if (typeof navigator === "undefined") return "en";
  const asked = navigator.languages?.length ? navigator.languages : [navigator.language];
  // The browser's first preference decides; a Norwegian second choice behind English does not.
  return NORWEGIAN.test(asked[0] ?? "") ? "nb" : "en";
}

function storedLang(): Lang | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "nb" || value === "en" ? value : null;
  } catch {
    return null;
  }
}

type LangContextValue = {
  lang: Lang;
  setLang: (next: Lang) => void;
  /** Pick the text for the current language: t("Post a voucher", "Før et bilag"). */
  t: <T>(en: T, nb: T) => T;
};

const LangContext = createContext<LangContextValue>({ lang: "en", setLang: () => {}, t: (en) => en });

/** A page's own tab title and description, in both languages. */
export type PageMeta = { title: { en: string; nb: string }; description: { en: string; nb: string } };

export const SITE_META: PageMeta = {
  title: {
    en: "Booki: Agent-first UI for your app",
    nb: "Booki: Agentisk UI for appen din",
  },
  description: {
    en: "Open-source UI components for people and AI agents. Build forms, tables and workflows with named actions and human approvals.",
    nb: "Åpne UI-komponenter for mennesker og AI-agenter. Bygg skjemaer, tabeller og arbeidsflyter med navngitte handlinger og menneskelig godkjenning.",
  },
};

const PageMetaContext = createContext<(meta: PageMeta | null) => void>(() => {});

export function LangProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [lang, setLangState] = useState<Lang>(() => storedLang() ?? browserLang());
  // A page may set its own title and description (usePageMeta); the site's apply otherwise.
  const [pageMeta, setPageMeta] = useState<PageMeta | null>(null);

  // The tab title and description follow the language too.
  useEffect(() => {
    const meta = pageMeta ?? SITE_META;
    const title = meta.title[lang];
    const description = meta.description[lang];
    document.documentElement.lang = lang === "nb" ? "nb" : "en";
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", description);
    // Share previews drop a component's code name, as the build's HTML does (scripts/prerender.mjs).
    const share = title.replace(/ \([A-Z][A-Za-z0-9]*\)(?= · Booki$)/, "");
    document.querySelector('meta[name="twitter:title"]')?.setAttribute("content", share);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute("content", description);
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", share);
    document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
  }, [lang, pageMeta]);

  useEffect(() => {
    const route = pathname.replace(/\/+$/, "") || "/";
    const url = `https://booki.dev${route}`;
    document.querySelector('link[rel="canonical"]')?.setAttribute("href", url);
    document.querySelector('meta[property="og:url"]')?.setAttribute("content", url);
    document
      .querySelector('link[rel="alternate"][type="text/markdown"]')
      ?.setAttribute("href", route === "/" ? "/index.md" : `${route}.md`);
  }, [pathname]);

  // Follow the browser while the visitor has not picked one themselves.
  useEffect(() => {
    const follow = () => {
      if (!storedLang()) setLangState(browserLang());
    };
    window.addEventListener("languagechange", follow);
    return () => window.removeEventListener("languagechange", follow);
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* private mode: the pick lasts this page view */
    }
  }, []);

  const value = useMemo<LangContextValue>(
    () => ({ lang, setLang, t: (en, nb) => (lang === "nb" ? nb : en) }),
    [lang, setLang],
  );
  return (
    <LangContext.Provider value={value}>
      <PageMetaContext.Provider value={setPageMeta}>{children}</PageMetaContext.Provider>
    </LangContext.Provider>
  );
}

export const useLang = () => useContext(LangContext);

/** Give the tab this page's title and description while the page is shown, in the site's language. Pass a stable object. */
/** The page meta the build's HTML render saw, so each page's HTML has its own title. */
export const renderedPageMeta: { current: PageMeta | null } = { current: null };

export function usePageMeta(meta: PageMeta) {
  const set = useContext(PageMetaContext);
  // The build renders without effects: note the meta here instead.
  // oxlint-disable-next-line react/immutability -- the one write a render makes, and only in the build
  if ((globalThis as { __BOOKI_PRERENDER__?: boolean }).__BOOKI_PRERENDER__) renderedPageMeta.current = meta;
  useEffect(() => {
    set(meta);
    return () => set(null);
  }, [set, meta]);
}
