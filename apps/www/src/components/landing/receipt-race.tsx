import { Button as SdkButton } from "@ui-sdk/react/button";
import { useState } from "react";

import { fairCost, formatters, sideName, sidesFor, type BenchSide, type BenchTask } from "@/lib/bench";
import { useLang } from "@/lib/lang";

import { BookiMark } from "../booki-logo";

/** Series validated against paper; Booki takes the agent's ink. */
const COLOR: Record<string, string> = {
  tripletex: "var(--bk-series-1)",
  dnb: "var(--bk-series-4)",
  acc: "var(--bk-signal-ink)",
};

/** Booki first: the result, then what it is compared with. */
const ORDER = ["acc", "tripletex", "dnb"];

/** Lines a folded receipt shows before "… n more". */
const FOLDED = 6;

/** ms between printed lines, and between squares within a line. */
const LINE = 60;
const SQUARE = 12;

/**
 * The browser tools' names are jargon (snapshot, hover, mouse_move_xy); each
 * line says what the agent did in a word a person would use, [en, nb].
 */
const TOOL_WORD: Record<string, [string, string]> = {
  snapshot: ["read page", "les siden"],
  take_screenshot: ["screenshot", "ta bilde"],
  click: ["click", "klikk"],
  type: ["type", "skriv"],
  hover: ["point at", "pek på"],
  mouse_move_xy: ["move mouse", "flytt mus"],
  select_option: ["choose", "velg"],
  press_key: ["key", "tast"],
  act: ["act", "utfør"],
};

/**
 * The race as receipts: Booki first, then the screens it is compared with.
 * One printed line per model turn with the tool it called, and on each line a
 * square for every 1 000 tokens billed for that turn. Folded, every receipt
 * shows its first lines and stands as tall as the others, with the totals on
 * one line at the foot; one button unfolds all three. Prints on mount and on
 * Replay; reduced motion shows it printed.
 */
export function ReceiptRace({ task }: { task: BenchTask }) {
  const { lang, t } = useLang();
  const f = formatters(lang);
  const [round, setRound] = useState(0);
  const [open, setOpen] = useState(false);
  const sides = [...sidesFor(task)].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
  const longest = Math.max(...sides.map((side) => side.billedInput.length));
  const folds = longest > FOLDED + 1;
  const booki = sides.find((side) => side.key === "acc");
  const bookiCost = booki ? fairCost(booki) : 0;
  // The takeaway, in numbers from the run: what each screen cost as a multiple of Booki.
  const others = sides
    .filter((side) => side.key !== "acc" && bookiCost > 0)
    .map((side) => ({
      name: sideName(side.name, lang).split(" · ")[0],
      times: `${Math.round(fairCost(side) / bookiCost)}×`,
    }));
  // One multiple when the screens agree ("5× as much"); otherwise each named.
  const same = others.every((other) => other.times === others[0]?.times);
  const without = same
    ? t(`Without Booki it cost ${others[0]?.times} as much.`, `Uten Booki kostet den ${others[0]?.times} så mye.`)
    : t(
        `Without Booki it cost ${others.map((o, i) => `${o.times}${i === 0 ? " as much" : ""} on ${o.name}`).join(" and ")}.`,
        `Uten Booki kostet den ${others.map((o, i) => `${o.times}${i === 0 ? " så mye" : ""} på ${o.name}`).join(" og ")}.`,
      );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="receipt-race__intro">
          <h3>{t("Same task, three receipts", "Samme oppgave, tre kvitteringer")}</h3>
          {booki ? (
            <p>
              {t(
                `Booki did it for ${f.usd(bookiCost, 3)}. ${without}`,
                `Booki gjorde den for ${f.usd(bookiCost, 3)}. ${without}`,
              )}
            </p>
          ) : null}
        </div>
        <SdkButton className="site-text-button text-sm" onClick={() => setRound((n) => n + 1)}>
          {t("Replay", "Spill av igjen")}
        </SdkButton>
      </div>

      <div className="receipt-race" key={`${task}-${round}`} data-open={open ? "" : undefined}>
        {sides.map((side) => (
          <Receipt key={`${side.key}-${side.name}`} side={side} open={open || !folds} bookiCost={bookiCost} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-xs text-muted-foreground">
          {t(
            "One line per model turn, with what the agent did; one square per 1 000 tokens billed for that turn.",
            "Én linje per modelltur, med hva agenten gjorde; én rute per 1 000 tokens fakturert for den turen.",
          )}
        </p>
        {folds ? (
          <SdkButton className="site-text-button text-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open
              ? t("Fold the receipts", "Fold sammen kvitteringene")
              : t("Show the whole receipts", "Vis hele kvitteringene")}
          </SdkButton>
        ) : null}
      </div>
    </div>
  );
}

/**
 * One slip. Declared at module level so it keeps its identity: the section
 * re-renders on every frame while its figures count up, and a component
 * declared inside it would remount, and reprint, on each of those frames.
 */
function Receipt({ side, open, bookiCost }: { side: BenchSide; open: boolean; bookiCost: number }) {
  const { lang, t } = useLang();
  const f = formatters(lang);
  // billedInput is cumulative: what one turn cost is the step from the turn before.
  const turns = side.billedInput.map((total, i) => total - (side.billedInput[i - 1] ?? 0));
  const tools = (side as { tools?: string[] }).tools ?? [];
  const shown = open ? turns : turns.slice(0, FOLDED);
  const hidden = turns.length - shown.length;
  const label = side.key === "acc" ? "Booki + ERP" : sideName(side.name, lang).split(" · ")[0];
  let delay = 0;
  return (
    <section
      className="receipt"
      // a slip is paper in either theme, and the vendors' logos are drawn for paper
      data-bk-theme="light"
      data-ours={side.key === "acc" ? "" : undefined}
      aria-label={t(
        `${label}: ${side.calls} tool calls, ${f.int(side.billedInput.at(-1) ?? 0)} input tokens billed, ${f.usd(fairCost(side), 3)}`,
        `${label}: ${side.calls} verktøykall, ${f.int(side.billedInput.at(-1) ?? 0)} fakturerte input-tokens, ${f.usd(fairCost(side), 3)}`,
      )}
    >
      <p className="receipt__head">
        <b className="receipt__brand">
          <Brand side={side.key} />
        </b>
        <span>{t(`Receipt · ${turns.length} model turns`, `Kvittering · ${turns.length} modellturer`)}</span>
      </p>
      <ol className="receipt__lines" aria-hidden="true">
        {shown.map((tokens, i) => {
          const start = delay;
          delay += LINE;
          const tool = tools[i];
          const squares = Math.max(1, Math.round(tokens / 1000));
          return (
            <li key={i} style={{ animationDelay: `${start}ms` }}>
              <span className="receipt__tool">
                {tool ? (TOOL_WORD[tool] ? t(...TOOL_WORD[tool]) : tool) : t("answer", "svar")}
              </span>
              <span
                className="receipt__squares"
                style={
                  {
                    "--c": COLOR[side.key] ?? "var(--bk-series-1)",
                  } as React.CSSProperties
                }
              >
                {Array.from({ length: squares }, (_, j) => (
                  <i key={j} style={{ animationDelay: `${start + j * SQUARE}ms` }} />
                ))}
              </span>
              <span className="receipt__n">{f.int(tokens)}</span>
            </li>
          );
        })}
        {hidden > 0 ? (
          <li className="receipt__more" style={{ animationDelay: `${delay}ms` }}>
            {t(`⋯ ${hidden} more turns`, `⋯ ${hidden} turer til`)}
          </li>
        ) : null}
      </ol>
      <div className="receipt__total" style={{ animationDelay: `${delay + LINE}ms` }}>
        <p className="receipt__sum">
          <span>{t("Total", "Totalt")}</span>
          <b>{f.usd(fairCost(side), 3)}</b>
        </p>
        <p className="receipt__sub">
          <span>{f.int(side.billedInput.at(-1) ?? 0)} tokens</span>
          {side.key === "acc" ? (
            <span className="receipt__ratio" data-best="">
              {t("cheapest", "billigst")}
            </span>
          ) : bookiCost > 0 ? (
            <span className="receipt__ratio">{Math.round(fairCost(side) / bookiCost)}× Booki</span>
          ) : null}
        </p>
      </div>
    </section>
  );
}

/** Each receipt's letterhead: the vendor's own logo, as published on its site. */
function Brand({ side }: { side: string }) {
  if (side === "acc") {
    return (
      <>
        <BookiMark size={22} />
        <span>Booki</span>
        <span className="receipt__plus">+ ERP</span>
      </>
    );
  }
  if (side === "tripletex") return <img src="/logos/tripletex.svg" alt="Tripletex" width={67} height={22} />;
  if (side === "dnb") {
    return (
      <>
        <img src="/logos/dnb.svg" alt="DNB" width={35} height={24} />
        <span>Regnskap</span>
      </>
    );
  }
  return <span>{side}</span>;
}
