import { elementOf } from "@ui-sdk/core/observe";
import { isAllowed, type AgentDecision } from "./agent-policy.js";

/**
 * A visible agent cursor: before each step the agent asks the bridge to run,
 * a pointer glides to the control, rings it and presses for an edit,
 * and only then does the step run. People watch the agent work the screen the
 * way a colleague would, instead of seeing values change by themselves.
 *
 * It rides on the bridge's `allow`, which runs before every step and may
 * return a Promise the bridge waits for. Nothing about the step changes: the
 * cursor leads, your own `allow` still decides.
 */

/** The tip and the midpoints of the stem's ends lie on one line on the 24-unit icon grid. */
export const AGENT_CURSOR_PATH = "M2.5 2.5V18.5L5.75 15.25L8.25 21.25L11.75 19.75L9.25 13.75H13.75Z";
/** Crop used by the floating pointer to keep its tip at the target. */
export const AGENT_CURSOR_VIEW_BOX = "0.5 0.5 20 22";

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
  /**
   * The step itself, for narration in another language. `currency` is the
   * target's, when it says what its minor units count (an amount field).
   */
  step: { action: string; args: readonly unknown[]; currency?: string } | null;
  /**
   * True while the target itself moves (the page scrolls, layout shifts): the
   * ring should stick to it at once. False when it glides to a new target.
   */
  follow?: boolean;
  /** Custom glide duration shared with the renderer, in milliseconds. */
  travelMs?: number;
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

type Allow<S, D> = (step: S, context: { signal: AbortSignal }) => D | Promise<D>;

export type AgentCursorController = {
  /** Ring a read target or press an edit target. Resolves when the step may run. */
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
  wrap: <S extends AgentCursorStep, D extends AgentDecision = boolean>(allow: Allow<S, D>) => Allow<S, D>;
  /** Turn it off and on, for pages that should run at full speed. */
  setEnabled: (on: boolean) => void;
  enabled: () => boolean;
  subscribe: (listener: (state: AgentCursorState) => void) => () => void;
  state: () => AgentCursorState;
};

const IDLE: AgentCursorState = { phase: "idle", box: null, point: null, action: "", target: "", step: null };

function wait(ms: number, signal: AbortSignal) {
  if (signal.aborted || ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
  });
}

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** Actions that only read or check, and touch no button or field. */
const READING = /^(assert|explain|check|validate|verify|describe|preview|summari[sz]e|find(?:Blocks)?$|overdue$)/;

/** The part of a control the agent will actually touch. */
function targetOf(root: Element, step: AgentCursorStep): Element {
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

/**
 * Whether a sticky or fixed bar lies over the point: on screen by its box, but
 * the person cannot see it. Only such bars count, so an icon drawn inside a
 * field does not; and not one the target is itself part of.
 */
function isCovered(el: Element, point: { x: number; y: number }): boolean {
  const hit = document.elementFromPoint?.(point.x, point.y);
  if (!hit || el.contains(hit)) return false;
  for (let node: Element | null = hit; node && !node.contains(el); node = node.parentElement) {
    const { position } = getComputedStyle(node);
    if (position === "sticky" || position === "fixed") return true;
  }
  return false;
}

/** The target's currency, from its `data-currency`, when it has one. */
function currencyOf(root: Element): { currency?: string } {
  const currency = (root.closest("[data-currency]") ?? root.querySelector("[data-currency]"))?.getAttribute(
    "data-currency",
  );
  return currency ? { currency } : {};
}

/** Plain words for an action, so the label reads like a person narrating. */
function describe(step: AgentCursorStep): string {
  const verb = step.action.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  const first = step.args?.[0];
  const arg = typeof first === "string" || typeof first === "number" ? ` ${String(first).slice(0, 24)}` : "";
  return `${verb}${arg}`;
}

/**
 * Where the cursor's label fits beside the pointer at `x` in a viewport
 * `width` wide: to the right, or, near the right edge, to the left (`flip`),
 * and how many pixels it has (`room`) before it would leave the window.
 */
export function cursorLabelRoom(x: number, width: number): { flip: boolean; room: number } {
  const right = width - x - 30;
  const left = x - 24;
  const flip = right < 220 && left > right;
  return { flip, room: Math.max(80, Math.floor(flip ? left : right)) };
}

/** The label normally starts 20px below the tip and occupies one line. */
export const cursorLabelAbove = (y: number, height: number) => height - y < 50 && y > height / 2;

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
  let watching: AbortController | undefined;
  let visual: AbortController | undefined;
  const SCROLL_KEYS = new Set(["PageDown", "PageUp", "ArrowDown", "ArrowUp", "Home", "End", " "]);
  const watch = () => {
    if (watching || typeof window === "undefined") return;
    watching = new AbortController();
    const { signal } = watching;
    const took = () => {
      theirs = true;
    };
    const gave = () => {
      theirs = false;
    };
    window.addEventListener("wheel", took, { passive: true, signal });
    window.addEventListener("touchmove", took, { passive: true, signal });
    window.addEventListener(
      "keydown",
      (e) => {
        const field = e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]");
        if (!field && SCROLL_KEYS.has(e.key)) took();
        else if (e.key === "Enter") gave();
      },
      { signal },
    );
    // A press in the page (Run, Replay, a control) hands it back.
    window.addEventListener(
      "pointerdown",
      (e) => {
        // On the page itself is the scrollbar: that is scrolling, not a press.
        if (e.target === document.documentElement) took();
        else gave();
      },
      { signal },
    );
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
  const clear = () => {
    visual?.abort();
    visual = undefined;
    clearTimeout(idle);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    current = null;
  };
  const hide = () => {
    clear();
    if (state.phase !== "idle") set({ ...IDLE, follow: false, travelMs: undefined });
  };
  const begin = () => {
    clear();
    visual = new AbortController();
    return visual;
  };
  let viewportWidth = 0;
  let viewportHeight = 0;
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
      hide();
      return;
    }
    const next = measure(current);
    if (!same(next.box, state.box) || viewportWidth !== window.innerWidth || viewportHeight !== window.innerHeight) {
      set({ ...next, follow: true });
    }
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    frame = requestAnimationFrame(track);
  };
  const startTracking = () => {
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    if (!frame && typeof requestAnimationFrame !== "undefined") frame = requestAnimationFrame(track);
  };

  const lead = async (step: AgentCursorStep, { signal }: AbortController) => {
    const root = elementOf(step.ref);
    if (!root?.isConnected) {
      hide();
      return;
    }
    const el = targetOf(root, step);
    const still = reduced();
    watch();
    if (scroll && !theirs) {
      const r = el.getBoundingClientRect();
      const off = r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth;
      if (off || isCovered(el, measure(el).point)) {
        el.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
        await wait(still ? 0 : 320, signal);
      }
    }
    if (signal.aborted) return;
    if (!el.isConnected) return hide();
    const secret = root.closest("[data-agent-secret]") || root.querySelector("[data-agent-secret]");
    const args = secret ? [] : (step.args ?? []);
    current = el;
    set({
      travelMs: options.travel,
      follow: false,
      phase: "move",
      action: describe({ ...step, args }),
      target: step.label ?? step.component,
      step: { action: step.action, args, ...currencyOf(root) },
      ...measure(el),
    });
    startTracking();
    await wait(still ? 0 : travel, signal);
    if (signal.aborted || READING.test(step.action)) return;
    if (!el.isConnected) return hide();
    set({ phase: "press" });
    await wait(still ? 0 : press, signal);
  };

  const settle = (ok: boolean) => {
    if (!on || state.phase === "idle") return;
    clearTimeout(idle);
    idle = setTimeout(hide, linger);
    set({ phase: ok ? "done" : "refused" });
  };

  const rest = (el: Element, action = "") => {
    if (!on) return;
    if (!el.isConnected) return hide();
    begin();
    current = el;
    set({ travelMs: options.travel, phase: "done", action, target: "", step: null, follow: false, ...measure(el) });
    startTracking();
  };

  return {
    lead: async (step) => {
      if (on) await lead(step, begin());
    },
    settle,
    rest,
    wrap: (allow) => async (step, context) => {
      const { signal } = context;
      signal.throwIfAborted();
      if (!on) return allow(step, context);
      const owner = begin();
      const cancel = () => {
        if (visual === owner) hide();
      };
      signal.addEventListener("abort", cancel, { once: true });
      let ok = false;
      try {
        await lead(step, owner);
        signal.throwIfAborted();
        const decision = await allow(step, context);
        signal.throwIfAborted();
        ok = isAllowed(decision);
        return decision;
      } finally {
        signal.removeEventListener("abort", cancel);
        if (visual === owner) settle(ok);
      }
    },
    setEnabled: (next) => {
      on = next;
      if (!next) {
        watching?.abort();
        watching = undefined;
        theirs = false;
        hide();
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
