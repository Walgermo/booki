import { useLayoutEffect, useRef, useState, type Ref } from "react";

const SEEN = "booki-hero-seen";
/** px: below this the title wraps instead of shrinking further. */
const MIN = 40;
/** px: a very wide screen stops growing the title here. */
const MAX = 76;
/** Share of the width the line fills: large, with air at both ends. */
const FILL = 0.78;

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
};

function Title({ text, className, mark, markRef }: TitleProps) {
  const [play, setPlay] = useState(firstTimeThisSession);
  // Exposed for the demo below: how long until the title has landed.
  useLayoutEffect(() => {
    titleLanded.ms = play ? 1100 : 250;
  }, [play]);
  const [size, setSize] = useState<number | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const words = text.split(" ");

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
      const line = probe.scrollWidth;
      probe.remove();
      if (line > 0) setSize(Math.max(MIN, Math.min(MAX, Math.floor((100 * width * FILL) / line))));
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(box);
    void document.fonts?.ready.then(fit);
    return () => watch.disconnect();
  }, []);

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
            {word}
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </h1>
  );
}
