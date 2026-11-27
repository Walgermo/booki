import { Icon } from "@booki-aui/icons/react";
import { useId, useState } from "react";
import { NavLink } from "react-router-dom";

import { catalogText } from "../catalog-nb";
import { getCatalogItem } from "../catalog";
import { NAV_SECTIONS, PAGE_ICON, plainName } from "../docs-nav";
import { useLang, type Lang } from "@/lib/lang";

const ROUTES: Record<string, string> = {
  introduction: "/docs",
  demo: "/demo",
  "month-end": "/close",
  "erp-teams": "/erp-teams",
};

function navigation(lang: Lang) {
  return NAV_SECTIONS.map((section) => ({
    id: section.id,
    heading: section[lang],
    pages: section.pages.flatMap((name) => {
      const item = getCatalogItem(name);
      if (!item) return [];
      const { title, description } = catalogText(item, lang);
      const label = plainName(name, lang) ?? title;
      const keywords = [name, item.title, title, label, description, section[lang]].join(" ").toLowerCase();
      return [{ name, label, keywords }];
    }),
  }));
}

const pagesByLanguage = { en: navigation("en"), nb: navigation("nb") };

export function DocsNavigation() {
  const { lang, t } = useLang();
  const [query, setQuery] = useState("");
  const prefix = useId();
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const sections = pagesByLanguage[lang].map((section) => ({
    ...section,
    pages: section.pages.filter((page) => terms.every((term) => page.keywords.includes(term))),
  }));
  const count = sections.reduce((sum, section) => sum + section.pages.length, 0);
  const searchLabel = t("Find a docs page", "Finn en dokumentside");
  return (
    <>
      <input
        type="search"
        className="site-icons-search mb-4"
        aria-label={searchLabel}
        placeholder={searchLabel}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <p role="status" className={terms.length && !count ? "text-sm text-muted-foreground" : "sr-only"}>
        {terms.length > 0 &&
          (count ? t(`Pages found: ${count}`, `Sider funnet: ${count}`) : t("No matching pages.", "Ingen treff."))}
      </p>
      <div className="site-docnav">
        {sections
          .filter((section) => section.pages.length)
          .map((section) => (
            <section key={section.id} className="site-docnav__section" aria-labelledby={`${prefix}-${section.id}`}>
              <h2 id={`${prefix}-${section.id}`} className="site-kicker site-docnav__heading">
                {section.heading}
              </h2>
              <ul className="site-docnav__list">
                {section.pages.map(({ name, label }) => (
                  <li key={name}>
                    <NavLink
                      to={ROUTES[name] ?? `/docs/${name}`}
                      end={name === "introduction"}
                      className="site-nav-link site-docnav-link"
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
                        const disclosure = event.currentTarget.closest("details");
                        if (disclosure) {
                          disclosure.open = false;
                          disclosure.querySelector("summary")?.focus();
                        }
                      }}
                    >
                      {PAGE_ICON[name] ? <Icon name={PAGE_ICON[name]} className="site-docnav-icon" /> : null}
                      <span>{label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </>
  );
}
