import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useLang } from "@/lib/lang";

export function OnThisPage({ links }: { links: [id: string, label: string][] }) {
  const { t } = useLang();
  const location = useLocation();
  // A direct fragment or router link can arrive before a lazy docs page has mounted.
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [location]);
  return (
    <nav aria-label={t("On this page", "På denne siden")} className="my-6">
      <p className="site-kicker">{t("On this page", "På denne siden")}</p>
      <ul className="mt-2 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-sm">
        {links.map(([id, label]) => (
          <li key={id}>
            <a href={`#${id}`} className="site-link">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
