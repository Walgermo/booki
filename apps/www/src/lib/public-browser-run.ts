export const publicTasks = {
  nav: {
    steps: ["Nei", "Koffert med klokke Saksbehandlingstider", "Dagpenger · Vis mer"],
    start: "Nav",
    heading: "Saksbehandlingstider",
    consent: "declined",
    panel: "dagpenger",
    link: null,
  },
  posten: {
    steps: ["Avvis alle", "Se julens sendefrister"],
    start: "Posten",
    heading: "Sendefrister for julepost 2026",
    consent: "declined",
    panel: null,
    link: null,
  },
  brreg: {
    steps: ["Årsregnskap Innsending og forsinkelsesgebyr"],
    start: "Brønnøysundregistrene",
    heading: "Innsending av årsregnskap",
    consent: "",
    panel: null,
    link: "Forsinkelsesgebyr",
  },
} as const;

export type PublicTask = keyof typeof publicTasks;
export type PublicSide = "browser" | "booki";

export type PublicState = {
  heading: string;
  view: string | null;
  consent: string;
  panel: string | null;
  link: string | null;
};

export function readPublicState(doc: Document): PublicState {
  const main = doc.querySelector<HTMLElement>("main[data-public-fixture]");
  const view = new URLSearchParams(doc.location?.search).get("view");
  const panel = main?.querySelector('section[aria-label="Dagpenger"] [aria-expanded="true"]');
  const fees =
    view === "guidance" && main?.dataset.publicFixture === "brreg"
      ? Array.from(main.querySelectorAll<HTMLAnchorElement>("a[href]")).find(
          (link) => link.textContent?.trim() === "Forsinkelsesgebyr",
        )
      : null;
  return {
    heading: view ? (main?.querySelector("h1")?.textContent?.trim() ?? "") : (main?.dataset.publicTitle ?? ""),
    view,
    consent: main?.dataset.publicConsent ?? "",
    panel: panel ? "dagpenger" : null,
    link: fees?.textContent?.trim() ?? null,
  };
}

export function expectedPublicState(task: PublicTask, final: boolean): PublicState {
  const { start, heading, consent, panel, link } = publicTasks[task];
  return final
    ? { heading, view: "guidance", consent, panel, link }
    : { heading: start, view: null, consent: "", panel: null, link: null };
}

export function publicChecks(actual: PublicState, expected: PublicState) {
  return (Object.keys(expected) as (keyof PublicState)[]).map((name) => ({
    name,
    actual: actual[name],
    expected: expected[name],
    ok: expected[name] === actual[name],
  }));
}

type FrameBridge = {
  snapshot: () => { ref: string; label?: string; actions: string[] }[];
  act: (input: { steps: { ref: string; action: "press" }[] }) => Promise<{ ok: boolean }>;
};

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function readWhen<T>(read: () => T | null | undefined, signal: AbortSignal): Promise<T | null> {
  const until = performance.now() + 8000;
  while (performance.now() < until) {
    signal.throwIfAborted();
    const value = read();
    if (value != null) return value;
    await pause(40);
  }
  signal.throwIfAborted();
  return null;
}

/** Drive a same-origin fixture. Tool transcripts come from the separate MCP/bridge proof. */
export async function runPublicArm(
  frame: HTMLIFrameElement,
  task: PublicTask,
  side: PublicSide,
  signal: AbortSignal,
  onStep: (label: string) => void,
): Promise<boolean> {
  const doc = await readWhen(() => {
    const current = frame.contentDocument;
    return current?.location?.pathname === `/bench/public/${task}/${side}` &&
      current.querySelector(`main[data-public-fixture="${task}"]`)
      ? current
      : null;
  }, signal);
  if (!doc || !publicChecks(readPublicState(doc), expectedPublicState(task, false)).every(({ ok }) => ok)) return false;
  const bridge = (frame.contentWindow as (Window & { agent?: FrameBridge }) | null)?.agent;

  for (const label of publicTasks[task].steps) {
    if (side === "booki") {
      const entry = await readWhen(
        () => bridge?.snapshot().find((item) => item.label === label && item.actions.includes("press")),
        signal,
      );
      if (!entry || !bridge) return false;
      const result = await bridge.act({ steps: [{ ref: entry.ref, action: "press" }] });
      if (!result.ok) return false;
    } else {
      const element = await readWhen(
        () =>
          Array.from(doc.querySelectorAll<HTMLElement>("[data-public-document] button, [data-public-document] a")).find(
            (control) =>
              (control.getAttribute("aria-label") ?? control.textContent?.trim()) === label &&
              control.getClientRects().length > 0,
          ),
        signal,
      );
      if (!element) return false;
      element.click();
    }
    signal.throwIfAborted();
    onStep(label);
    await pause(300);
  }

  const final = expectedPublicState(task, true);
  return (
    (await readWhen(() => (publicChecks(readPublicState(doc), final).every(({ ok }) => ok) ? true : null), signal)) ===
    true
  );
}
