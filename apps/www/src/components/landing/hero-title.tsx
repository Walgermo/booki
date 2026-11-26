import { useEffect, useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";

const SEEN = "booki-hero-seen";
/** px: below this the title wraps instead of shrinking further. */
const MIN = 40;
/** px: a very wide screen stops growing the title here. */
const MAX = 76;
/** Share of the width the line fills: large, with air at both ends. */
const FILL = 0.78;

/** ms before the last word first changes: the title has landed and the agent's cursor has left it. */
const FIRST_TURN = 5200;
/** ms each word stays. */
const EVERY = 2800;

/** When the title has landed, in ms after mount; read by the demo that starts from the marked word. */
export const titleLanded = { ms: 250 };

/** Played once per session: a returning visit within it shows the title at rest. */
function firstTimeThisSession(): boolean {
  try {
    if (sessionStorage.getItem(SEEN)) return false;
    sessionStorage.setItem(SEEN, "1");
  } catch {
    /* storage blocked: play it */
  }
  return true;
}

/**
 * The hero title, one line across the full width, its words arriving one after
 * another. The size is measured, not guessed: the title is laid out on one line
 * at 100px, and the font size is scaled so that line fills FILL of its container. On a
 * narrow screen it stops at MIN and wraps. Each word is its own span with its
 * place in `--i`; the stagger and the reduced-motion path live in globals.css.
 * `mark` names the word the agent's cursor starts from (`markRef` is its element).
 *
 * `rotate` lists what the last word may be, the title's own last word first.
 * The title is sized for the longest of them, so the line never outgrows its
 * width; the word's slot takes each word's measured width, so the line stays
 * centred as it changes. The word goes round once and settles on the first.
 * A screen reader, a page without JavaScript and a visitor who asked for
 * reduced motion get the first word and no change.
 */
export function HeroTitle(props: TitleProps) {
  // Another text (another language) is another title: measured again, and at rest.
  return <Title key={props.text} {...props} />;
}

type TitleProps = {
  text: string;
  className?: string;
  mark?: string;
  /** The marked word's element, for the agent's cursor to start from. */
  markRef?: Ref<HTMLSpanElement>;
  /** What the last word may be, the title's own last word first. */
  rotate?: string[];
};

function Title({ text, className, mark, markRef, rotate }: TitleProps) {
  const [play, setPlay] = useState(firstTimeThisSession);
  // Exposed for the demo below: how long until the title has landed.
  useLayoutEffect(() => {
    titleLanded.ms = play ? 1100 : 250;
  }, [play]);
  const [size, setSize] = useState<number | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const words = text.split(" ");
  // The same list on every render, whatever array the caller built.
  const rotateKey = rotate && rotate.length > 1 ? rotate.join("\n") : "";
  const variants = useMemo(() => (rotateKey ? rotateKey.split("\n") : []), [rotateKey]);
  /** Each variant's width in em, measured; null until then. */
  const [widths, setWidths] = useState<number[] | null>(null);
  // `left` is the word on its way out, until its exit has played; `turned` says the shown word arrived by a turn.
  const [turn, setTurn] = useState<{ shown: number; left: number | null; turned: boolean }>({
    shown: 0,
    left: null,
    turned: false,
  });

  // The last word goes round once on a slow clock, only while the title is on screen and the tab
  // is in front, and stops on the title's own word: the page does not keep changing while it is read.
  useEffect(() => {
    if (variants.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    let step = 0;
    const next = () => {
      const node = title.current;
      const onScreen = node ? node.getBoundingClientRect().bottom > 0 : false;
      if (onScreen && !document.hidden) {
        const from = step % variants.length;
        step += 1;
        setTurn({ shown: step % variants.length, left: from, turned: true });
        // Back on the first word: the round is done, and the clock stops.
        if (step === variants.length) return;
      }
      timer = window.setTimeout(next, EVERY);
    };
    timer = window.setTimeout(next, FIRST_TURN);
    return () => window.clearTimeout(timer);
  }, [variants]);

  useLayoutEffect(() => {
    const node = title.current;
    const box = node?.parentElement;
    if (!node || !box) return;
    const fit = () => {
      const width = box.clientWidth;
      // Measure the one-line width at 100px with a hidden copy, so the visible title never jumps.
      const probe = node.cloneNode(true) as HTMLElement;
      Object.assign(probe.style, {
        position: "absolute",
        visibility: "hidden",
        whiteSpace: "nowrap",
        fontSize: "100px",
        width: "auto",
        maxWidth: "none",
      });
      box.append(probe);
      // With a rotating last word: measure each variant, and size the line for the longest.
      const rotor = probe.querySelector<HTMLElement>(".hero-rotor");
      const word = rotor?.querySelector<HTMLElement>("[data-shown]");
      if (rotor && word && variants.length > 1) {
        rotor.style.width = "auto";
        rotor.querySelector("[data-left]")?.remove();
        const ems = variants.map((variant) => {
          word.textContent = variant;
          return Math.ceil(word.getBoundingClientRect().width * 10) / 1000;
        });
        word.textContent = variants[ems.indexOf(Math.max(...ems))]!;
        setWidths((now) => (now && now.join() === ems.join() ? now : ems));
      }
      const line = probe.scrollWidth;
      probe.remove();
      if (line > 0) setSize(Math.max(MIN, Math.min(MAX, Math.floor((100 * width * FILL) / line))));
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(box);
    void document.fonts?.ready.then(fit);
    return () => watch.disconnect();
  }, [variants]);

  const last = words.length - 1;
  return (
    <h1
      ref={title}
      className={`hero-words ${className ?? ""}`}
      data-play={play ? "" : undefined}
      data-fits={size !== null && size > MIN ? "" : undefined}
      style={size === null ? undefined : { fontSize: `${size}px` }}
    >
      {words.map((word, i) => (
        <span key={`${text}-${i}`}>
          <span
            className="hero-words__word"
            data-mark={mark && word === mark ? "" : undefined}
            ref={mark && word === mark ? markRef : undefined}
            style={{ "--i": i } as React.CSSProperties}
            onAnimationEnd={i === words.length - 1 ? () => setPlay(false) : undefined}
          >
            {i === last && variants.length > 1 ? (
              <span className="hero-rotor" style={widths ? { width: `${widths[turn.shown]}em` } : undefined}>
                {/* What a screen reader hears: the title's own word, which does not change. */}
                <span className="sr-only">{word}</span>
                {turn.left === null ? null : (
                  <span
                    key={`left-${turn.left}`}
                    className="hero-rotor__word"
                    data-left=""
                    aria-hidden="true"
                    // Gone once it has left, so the page's text holds one word, not two.
                    onAnimationEnd={() => setTurn((now) => ({ ...now, left: null }))}
                  >
                    {variants[turn.left]}
                  </span>
                )}
                <span
                  key={`shown-${turn.shown}`}
                  className="hero-rotor__word"
                  data-shown=""
                  data-arrives={turn.turned ? "" : undefined}
                  aria-hidden="true"
                >
                  {variants[turn.shown]}
                </span>
              </span>
            ) : (
              word
            )}
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </h1>
  );
}
