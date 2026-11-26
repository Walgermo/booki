import { iconAliases, iconCategories, iconComponentName, iconNames, type IconName } from "@booki-aui/icons";
import { DownloadIcon, Icon, PencilIcon, TrashIcon } from "@booki-aui/icons/react";
import { IconButton } from "@booki-aui/react";
import { Input } from "@ui-sdk/react/input";
import { useMemo, useState } from "react";

import { InstallBlock } from "@/components/install-block";
import { PAGE_ICON, plainName } from "@/docs-nav";
import { Button } from "@/components/ui/button";
import { useLang, usePageMeta } from "@/lib/lang";

const META = {
  title: { en: "Icons · Booki", nb: "Ikoner · Booki" },
  description: {
    en: "Duotone icons for accounting UI: search them, copy the import, use them in React or any framework.",
    nb: "Duotone-ikoner for regnskaps-UI: søk i dem, kopier importen, bruk dem i React eller et annet rammeverk.",
  },
};

const REACT_USAGE = `import { BanknoteIcon, BankIcon } from "@booki-aui/icons/react"

<BanknoteIcon />                                        // 16 px, decorative
<BankIcon size={20} aria-label="Bank account" role="img" /> // names a control`;

const BUTTON_USAGE = `import { IconButton } from "@booki-aui/react"
import { TrashIcon } from "@booki-aui/icons/react"

<IconButton label="Delete line 2" icon={<TrashIcon />} data-agent-confirm="Deleting needs a person" />
// An agent presses it by its label: { ref: "Delete line 2", action: "press" }`;

const ANY_USAGE = `import { iconSvg } from "@booki-aui/icons"

element.innerHTML = iconSvg("banknote")       // a complete <svg>, 16 px
element.innerHTML = iconSvg("banknote", 20)`;

const normalizeSearch = (text: string) =>
  text
    .toLowerCase()
    .replace(/[-\s]+/g, " ")
    .trim();

const importLine = (name: IconName) => `import { ${iconComponentName(name)} } from "@booki-aui/icons/react"`;

/** What each icon can be found by: its name, its aliases, and the docs pages it marks, in both languages. */
const SEARCH_WORDS: Record<IconName, string> = Object.fromEntries(
  iconNames.map((name) => {
    const pages = Object.entries(PAGE_ICON)
      .filter(([, icon]) => icon === name)
      .flatMap(([page]) => [page, plainName(page, "en") ?? "", plainName(page, "nb") ?? ""]);
    return [name, normalizeSearch([name, ...iconAliases[name], ...pages].join(" "))];
  }),
) as Record<IconName, string>;

/** Every icon, searchable by its name or by what it stands for in Booki; a press copies the import. */
export function IconsPage() {
  const { t } = useLang();
  usePageMeta(META);
  const [query, setQuery] = useState("");
  // The last icon pressed, and whether the clipboard took its import (it can be blocked).
  const [copied, setCopied] = useState<{ name: IconName; ok: boolean } | null>(null);

  const groups = useMemo(() => {
    const q = normalizeSearch(query);
    return iconCategories
      .map((group) => ({
        ...group,
        icons: q ? group.icons.filter((name) => SEARCH_WORDS[name].includes(q)) : group.icons,
      }))
      .filter((group) => group.icons.length);
  }, [query]);
  const count = groups.reduce((sum, group) => sum + group.icons.length, 0);

  async function copy(name: IconName) {
    let ok = true;
    try {
      await navigator.clipboard.writeText(importLine(name));
    } catch {
      // Blocked (permissions or an insecure context): the line is shown to copy by hand instead.
      ok = false;
    }
    setCopied({ name, ok });
    if (ok) window.setTimeout(() => setCopied((current) => (current?.name === name ? null : current)), 1600);
  }

  return (
    <article className="grid min-w-0 gap-8">
      <header className="grid gap-3">
        <p className="site-kicker">{t("Building blocks", "Byggeklosser")}</p>
        <h1 className="site-page-title m-0">{t("Icons", "Ikoner")}</h1>
        <p className="m-0 max-w-prose text-muted-foreground">
          {t(
            `${iconNames.length} duotone icons for accounting UI, drawn for 16 and 20 px on one grid and stroke. They take the colour of the text beside them, in the light and the dark theme. Search by name or by what an icon stands for ("voucher", "KID", "token"); press one to copy its import.`,
            `${iconNames.length} duotone-ikoner for regnskaps-UI, tegnet for 16 og 20 px på samme rutenett og strek. De tar fargen fra teksten ved siden av, i lyst og mørkt tema. Søk på navn eller på hva et ikon står for («voucher», «KID», «token»); trykk på et for å kopiere importen.`,
          )}
        </p>
        <InstallBlock command="pnpm add @booki-aui/icons" className="my-0 max-w-prose" />
      </header>

      <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-labelledby="icons-browse">
        <h2 id="icons-browse" className="sr-only">
          {t("All icons", "Alle ikoner")}
        </h2>
        <label className="grid max-w-sm gap-1.5">
          <span className="text-sm font-medium">{t("Search icons", "Søk i ikonene")}</span>
          <Input
            type="search"
            className="site-icons-search"
            aria-label={t("Search icons", "Søk i ikonene")}
            value={query}
            onValueChange={(value: string) => setQuery(value)}
            placeholder={t("bank, voucher, approval …", "bank, bilag, godkjenning …")}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <p className="m-0 text-sm text-muted-foreground" role="status" aria-live="polite">
          {copied?.ok
            ? t(`Copied: ${importLine(copied.name)}`, `Kopiert: ${importLine(copied.name)}`)
            : t(`${count} of ${iconNames.length} icons`, `${count} av ${iconNames.length} ikoner`)}
        </p>
        {copied && !copied.ok ? (
          <p className="m-0 text-sm">
            {t(
              "Your browser blocked the clipboard. Copy the line:",
              "Nettleseren stoppet utklippstavlen. Kopier linjen:",
            )}{" "}
            <code className="site-code-name select-all">{importLine(copied.name)}</code>
          </p>
        ) : null}
        {count ? (
          groups.map((group) => (
            <div key={group.id} className="grid gap-2">
              <h3 className="site-kicker m-0">{t(group.en, group.nb)}</h3>
              <ul className="site-icons-grid">
                {group.icons.map((name) => (
                  <li key={name}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="site-icons-tile"
                      data-copied={copied?.name === name ? "" : undefined}
                      aria-label={t(`${name}: copy the import`, `${name}: kopier importen`)}
                      onClick={() => void copy(name)}
                    >
                      <Icon name={name} size={20} />
                      <span className="site-icons-name">{name}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <p className="m-0 text-sm">
            {t(
              `No icon matches "${query}". Try a word for what it shows or stands for.`,
              `Ingen ikoner passer til «${query}». Prøv et ord for det det viser eller står for.`,
            )}
          </p>
        )}
      </section>

      <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2" aria-labelledby="icons-use">
        <h2 id="icons-use" className="m-0 text-xl font-semibold">
          {t("Use them", "Bruk dem")}
        </h2>
        <p className="m-0 max-w-prose text-muted-foreground">
          {t(
            'Import the named component for each icon you use, so a bundler brings in only those. Icons are decorative unless you give them a label; an icon that alone names a button needs aria-label and role="img". Keep them at 16 or 20 px, the sizes they are drawn for.',
            'Importer den navngitte komponenten for hvert ikon dere bruker, så tar bundleren bare med dem. Ikoner er dekorative med mindre dere gir dem en etikett; et ikon som alene navngir en knapp trenger aria-label og role="img". Hold dem på 16 eller 20 px, størrelsene de er tegnet for.',
          )}
        </p>
        <InstallBlock label="React" language="jsx" command={REACT_USAGE} />
        <InstallBlock label={t("Any framework", "Alle rammeverk")} language="javascript" command={ANY_USAGE} />
        <p className="m-0 max-w-prose text-sm text-muted-foreground">
          {t(
            'The plain files are at @booki-aui/icons/svg/<name>.svg. <Icon name="…" /> takes the name as data, but brings every icon into the bundle.',
            'De rene filene ligger på @booki-aui/icons/svg/<navn>.svg. <Icon name="…" /> tar navnet som data, men tar med alle ikonene i bundlen.',
          )}
        </p>
      </section>
      <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2" aria-labelledby="icons-buttons">
        <h2 id="icons-buttons" className="m-0 text-xl font-semibold">
          {t("Icon buttons an agent can read", "Ikonknapper en agent kan lese")}
        </h2>
        <p className="m-0 max-w-prose text-muted-foreground">
          {t(
            'A button with only an icon has no name, so an agent sees "button" and has to guess. IconButton from @booki-aui/react needs a label: it is the button\'s name and tooltip, the icon is hidden, and the agent presses it by those words. The readiness check flags icon-only buttons without one.',
            "En knapp med bare et ikon har ikke noe navn, så en agent ser «knapp» og må gjette. IconButton fra @booki-aui/react krever en etikett: den er knappens navn og verktøytips, ikonet er skjult, og agenten trykker på den med de ordene. Readiness-sjekken flagger ikonknapper uten.",
          )}
        </p>
        <div
          className="site-icons-buttons"
          role="group"
          aria-label={t("Example icon buttons", "Eksempel på ikonknapper")}
        >
          <IconButton label={t("Edit line 2", "Rediger linje 2")} icon={<PencilIcon />} />
          <IconButton
            label={t("Delete line 2", "Slett linje 2")}
            icon={<TrashIcon />}
            data-agent-confirm={t("Deleting a line needs a person", "Å slette en linje krever en person")}
          />
          <IconButton label={t("Export CSV", "Eksporter CSV")} icon={<DownloadIcon />} showLabel />
        </div>
        <InstallBlock label="React" language="jsx" command={BUTTON_USAGE} />
      </section>
    </article>
  );
}
