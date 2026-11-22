import { Link } from "react-router-dom";

import { InstallBlock } from "@/components/install-block";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang";
import { AGENT_PROMPT } from "./shared";

/** The last thing on the landing page: one screen, in front of an agent. Each default follows the site's language. */
export function Closing({
  kicker,
  title,
  text,
  link,
}: {
  kicker?: string;
  title?: string;
  text?: string;
  link?: { to: string; label: string };
} = {}) {
  const { t } = useLang();
  const shown = {
    kicker: kicker ?? t("Start with one screen", "Begynn med ett skjermbilde"),
    title:
      title ?? t("Put one screen in front of an agent this week.", "Sett ett skjermbilde foran en agent denne uken."),
    text:
      text ??
      t(
        "Swap the fields on one screen, keep your backend, and measure the same task before and after.",
        "Bytt ut feltene på ett skjermbilde, behold backenden, og mål den samme oppgaven før og etter.",
      ),
    link: link ?? { to: "/erp-teams", label: t("What a pilot takes", "Hva en pilot krever") },
  };
  return (
    <section aria-labelledby="closing-title" className="site-machine site-band">
      <div className="grid gap-5">
        <p className="site-kicker">{shown.kicker}</p>
        <h2 id="closing-title" className="site-band__title max-w-[16ch]">
          {shown.title}
        </h2>
        <p className="m-0 max-w-[46ch] text-ink-muted">{shown.text}</p>
      </div>
      <div className="grid gap-3 sm:flex sm:flex-wrap lg:justify-end">
        <InstallBlock variant="hero" command={AGENT_PROMPT} />
        <Button asChild variant="outline" size="lg">
          <Link to={shown.link.to}>{shown.link.label}</Link>
        </Button>
      </div>
    </section>
  );
}
