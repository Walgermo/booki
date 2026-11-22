import { elementOf } from "@ui-sdk/core/observe";

/**
 * A visible agent cursor: before each step the agent asks the bridge to run,
 * a pointer glides to the control, a ring settles on it, the pointer presses,
 * and only then does the step run. People watch the agent work the screen the
 * way a colleague would, instead of seeing values change by themselves.
 *
 * It rides on the bridge's `allow`, which runs before every step and may
 * return a Promise the bridge waits for. Nothing about the step changes: the
 * cursor leads, your own `allow` still decides.
 */

/** The fields of a bridge step the cursor reads. */
export type AgentCursorStep = {
  ref: string;
  component: string;
  label?: string;
  action: string;
  args?: readonly unknown[];
  confirm?: string;
};

export type AgentCursorPhase = "idle" | "move" | "press" | "done" | "refused";

export type AgentCursorState = {
  phase: AgentCursorPhase;
  /** The target's box, in viewport pixels. */
  box: { x: number; y: number; width: number; height: number } | null;
  /** Where the pointer's tip rests on the target. */
  point: { x: number; y: number } | null;
  /** What the agent is doing, for the label, in plain English words. */
  action: string;
  target: string;
  /** The step itself, for narration in another language. */
  step: { action: string; args: readonly unknown[] } | null;
  /**
   * True while the target itself moves (the page scrolls, layout shifts): the
   * ring should stick to it at once. False when it glides to a new target.
   */
  follow?: boolean;
};

export type AgentCursorOptions = {
  /** Glide time from one control to the next, in ms. Default 420. */
  travel?: number;
  /** Press time, in ms. Default 160. */
  press?: number;
  /** How long it stays after the last step, in ms. Default 1600. */
  linger?: number;
  /**
   * Scroll a control into view before going to it. Default true. Once the
   * person scrolls the page themselves (wheel, touch, scroll keys), the cursor
   * stops scrolling, so it never pulls them back up to where it works; it
   * scrolls again after their next press or click in the page.
   */
  scroll?: boolean;
};

type Allow<S> = (step: S, context: { signal: AbortSignal }) => boolean | Promise<boolean>;

export type AgentCursorController = {
  /** Move to the step's control and press. Resolves when the step may run. */
  lead: (step: AgentCursorStep) => Promise<void>;
  /** Show the outcome: the step ran, or was refused. */
  settle: (ok: boolean) => void;
  /**
   * Rest on any element until the next step: a page can show where the agent
   * starts, and the first step glides from there. `action` is the label's text.
   */
  rest: (el: Element, action?: string) => void;
  /**
   * Wrap your `allow`: the cursor leads, then your function decides. Pass the
   * result to `createBookiAgent({ allow })` and `registerTools`.
   */
  wrap: <S extends AgentCursorStep>(allow: Allow<S>) => Allow<S>;
  /** Turn it off and on, for pages that should run at full speed. */
  setEnabled: (on: boolean) => void;
  enabled: () => boolean;
  subscribe: (listener: (state: AgentCursorState) => void) => () => void;
  state: () => AgentCursorState;
};

const IDLE: AgentCursorState = { phase: "idle", box: null, point: null, action: "", target: "", step: null };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** Actions that only read or check, and touch no button or field. */
const READING = /^(assert|explain|check|validate|verify|describe|preview|summari[sz]e)/;

/** The part of a control the agent will actually touch. */
function targetOf(step: AgentCursorStep): Element | null {
  const root = elementOf(step.ref);
  if (!root) return null;
  if (step.action === "press" && typeof step.args?.[0] === "string") {
    const wanted = step.args[0].trim().toLowerCase();
    const buttons = [...root.querySelectorAll("button, [role=button], a[href]")];
    const hit =
      buttons.find((b) => b.textContent?.trim().toLowerCase() === wanted) ??
      buttons.find((b) => b.textContent?.toLowerCase().includes(wanted));
    if (hit) return hit;
  }
  // Checking is reading: ring the whole control, so it never looks like a press.
  if (READING.test(step.action)) return root;
  if (root.matches("button, input, select, textarea")) return root;
  return root.querySelector("input:not([type=hidden]), select, textarea, [role=combobox], button") ?? root;
}

/** Plain words for an action, so the label reads like a person narrating. */
function describe(step: AgentCursorStep): string {
  const verb = step.action.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  const first = step.args?.[0];
  const arg = typeof first === "string" || typeof first === "number" ? ` ${String(first).slice(0, 24)}` : "";
  return `${verb}${arg}`;
}

export function createAgentCursor(options: AgentCursorOptions = {}): AgentCursorController {
  const travel = options.travel ?? 420;
  const press = options.press ?? 160;
  const linger = options.linger ?? 1600;
  const scroll = options.scroll ?? true;
  const listeners = new Set<(state: AgentCursorState) => void>();
  let state = IDLE;
  let on = true;
  let current: Element | null = null;
  let idle: ReturnType<typeof setTimeout> | undefined;

  // The person's own scrolling takes the page back from the cursor.
  let theirs = false;
  let watching = false;
  const SCROLL_KEYS = new Set(["PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End", " "]);
  const watch = () => {
    if (watching || typeof window === "undefined") return;
    watching = true;
    const took = () => {
      theirs = true;
    };
    const gave = () => {
      theirs = false;
    };
    window.addEventListener("wheel", took, { passive: true });
    window.addEventListener("touchmove", took, { passive: true });
    window.addEventListener("keydown", (e) => {
      const field = e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]");
      if (!field && SCROLL_KEYS.has(e.key)) took();
      else if (e.key === "Enter") gave();
    });
    // A press in the page (Run, Replay, a control) hands it back.
    window.addEventListener("pointerdown", (e) => {
      // On the page itself is the scrollbar: that is scrolling, not a press.
      if (e.target === document.documentElement) took();
      else gave();
    });
  };

  const set = (next: Partial<AgentCursorState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener(state);
  };

  const measure = (el: Element) => {
    const r = el.getBoundingClientRect();
    return {
      box: { x: r.left, y: r.top, width: r.width, height: r.height },
      // Rest the tip a little inside, toward the start of the text, like a hand would.
      point: { x: r.left + Math.min(r.width * 0.35, 48), y: r.top + Math.min(r.height * 0.62, 28) },
    };
  };

  // Follow the target while it is shown: scrolling, resizing and layout that
  // moves under it (a line added above, a row that grows) all move the ring.
  let frame = 0;
  const same = (a: AgentCursorState["box"], b: AgentCursorState["box"]) =>
    !!a &&
    !!b &&
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5;
  const track = () => {
    frame = 0;
    if (!current || state.phase === "idle") return;
    if (!current.isConnected) {
      current = null;
      return;
    }
    const next = measure(current);
    if (!same(next.box, state.box)) set({ ...next, follow: true });
    frame = requestAnimationFrame(track);
  };
  const startTracking = () => {
    if (!frame && typeof requestAnimationFrame !== "undefined") frame = requestAnimationFrame(track);
  };

  const lead = async (step: AgentCursorStep) => {
    if (!on) return;
    const el = targetOf(step);
    if (!el) return;
    clearTimeout(idle);
    const still = reduced();
    watch();
    if (scroll && !theirs) {
      const r = el.getBoundingClientRect();
      const off = r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth;
      if (off) {
        el.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
        await wait(still ? 0 : 320);
      }
    }
    current = el;
    set({
      follow: false,
      phase: "move",
      action: describe(step),
      target: step.label ?? step.component,
      step: { action: step.action, args: step.args ?? [] },
      ...measure(el),
    });
    startTracking();
    await wait(still ? 0 : travel);
    set({ phase: "press" });
    await wait(still ? 0 : press);
  };

  const settle = (ok: boolean) => {
    if (!on || state.phase === "idle") return;
    set({ phase: ok ? "done" : "refused" });
    clearTimeout(idle);
    idle = setTimeout(() => {
      current = null;
      set({ ...IDLE });
    }, linger);
  };

  const rest = (el: Element, action = "") => {
    if (!on) return;
    clearTimeout(idle);
    current = el;
    set({ phase: "done", action, target: "", step: null, follow: false, ...measure(el) });
    startTracking();
  };

  return {
    lead,
    settle,
    rest,
    wrap: (allow) => async (step, context) => {
      await lead(step);
      let ok = false;
      try {
        ok = await allow(step, context);
      } finally {
        settle(ok);
      }
      return ok;
    },
    setEnabled: (next) => {
      on = next;
      if (!next) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        clearTimeout(idle);
        current = null;
        set({ ...IDLE });
      }
    },
    enabled: () => on,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    state: () => state,
  };
}
