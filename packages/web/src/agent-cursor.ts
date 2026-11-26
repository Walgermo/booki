import {
  AGENT_CURSOR_PATH,
  AGENT_CURSOR_VIEW_BOX,
  createAgentCursor,
  cursorLabelAbove,
  cursorLabelRoom,
  type AgentCursorController,
  type AgentCursorState,
} from "@booki-aui/primitives/agent-cursor";

export { createAgentCursor, type AgentCursorController, type AgentCursorState };

const SVG = "http://www.w3.org/2000/svg";

/**
 * `<booki-agent-cursor>`: the agent's visible pointer for pages without React.
 * Give it a cursor and wrap your allow with the same cursor:
 *
 * ```ts
 * const cursor = createAgentCursor()
 * const agent = createBookiAgent({ allow: cursor.wrap(allow) })
 * document.querySelector("booki-agent-cursor").cursor = cursor
 * ```
 *
 * The markup and `data-slot` names match @booki-aui/react's `AgentCursor`, so
 * @booki-aui/styles draws both. `label` sets the name on it; `narrate` (a
 * property) may turn the step into words in your language.
 */
// Importing the package on a server (SSR, tests in Node) must not throw: the
// element is only defined in a browser, where HTMLElement exists.
const ElementBase = (typeof HTMLElement === "undefined" ? class {} : HTMLElement) as typeof HTMLElement;

export class BookiAgentCursorElement extends ElementBase {
  #cursor: AgentCursorController | null = null;
  #stop: (() => void) | null = null;
  #seen = false;
  narrate: ((state: AgentCursorState) => string) | null = null;

  #root = document.createElement("div");
  #ring = document.createElement("span");
  #pointer = document.createElement("span");
  #label = document.createElement("span");
  #name = document.createElement("span");
  #action = document.createElement("span");

  constructor() {
    super();
    this.#root.dataset.slot = "agent-cursor";
    this.#root.dataset.phase = "idle";
    this.#root.setAttribute("aria-hidden", "true");
    this.#ring.dataset.slot = "agent-cursor-ring";
    this.#pointer.dataset.slot = "agent-cursor-pointer";
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("data-slot", "agent-cursor-arrow");
    svg.setAttribute("viewBox", AGENT_CURSOR_VIEW_BOX);
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "22");
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", AGENT_CURSOR_PATH);
    svg.append(path);
    const ripple = document.createElement("span");
    ripple.dataset.slot = "agent-cursor-ripple";
    this.#label.dataset.slot = "agent-cursor-label";
    this.#action.dataset.slot = "agent-cursor-action";
    this.#label.append(this.#name, this.#action);
    this.#pointer.append(svg, ripple, this.#label);
    this.#root.append(this.#ring, this.#pointer);
  }

  static get observedAttributes() {
    return ["label"];
  }

  connectedCallback() {
    if (!this.#root.isConnected) this.append(this.#root);
    this.#name.textContent = this.getAttribute("label") ?? "Agent";
    if (this.#cursor && !this.#stop) this.#stop = this.#cursor.subscribe((state) => this.#render(state));
  }

  disconnectedCallback() {
    this.#stop?.();
    this.#stop = null;
  }

  attributeChangedCallback() {
    this.#name.textContent = this.getAttribute("label") ?? "Agent";
  }

  get cursor() {
    return this.#cursor;
  }

  set cursor(next: AgentCursorController | null) {
    this.#stop?.();
    this.#stop = null;
    this.#cursor = next;
    this.#seen = false;
    if (next && this.isConnected) this.#stop = next.subscribe((state) => this.#render(state));
    if (!next) {
      this.#root.dataset.phase = "idle";
      this.#pointer.hidden = this.#ring.hidden = true;
      this.#action.textContent = "";
    }
  }

  #render(state: AgentCursorState) {
    const first = state.phase !== "idle" && !this.#seen;
    this.#seen = state.phase !== "idle";
    this.#root.dataset.phase = state.phase;
    if (state.travelMs === undefined) this.#root.style.removeProperty("--agent-cursor-travel");
    else this.#root.style.setProperty("--agent-cursor-travel", `${state.travelMs}ms`);
    if (state.follow) this.#root.dataset.follow = "";
    else delete this.#root.dataset.follow;
    if (first) this.#root.dataset.first = "";
    else delete this.#root.dataset.first;
    const { box, point } = state;
    this.#ring.hidden = !box;
    this.#pointer.hidden = !point;
    if (box) {
      this.#ring.style.transform = `translate(${box.x - 4}px, ${box.y - 4}px)`;
      this.#ring.style.width = `${box.width + 8}px`;
      this.#ring.style.height = `${box.height + 8}px`;
    }
    if (point) {
      this.#pointer.style.transform = `translate(${point.x}px, ${point.y}px)`;
      // Near the right edge the label goes left of the pointer, and it never runs out of the window.
      const fit = cursorLabelRoom(point.x, window.innerWidth);
      this.#pointer.toggleAttribute("data-flip", fit.flip);
      this.#pointer.toggleAttribute("data-above", cursorLabelAbove(point.y, window.innerHeight));
      this.#pointer.style.setProperty("--agent-cursor-room", `${fit.room}px`);
    }
    const said = this.narrate ? this.narrate(state) : state.action;
    this.#action.textContent = state.action ? ` · ${said}${state.target ? ` · ${state.target}` : ""}` : "";
  }
}

if (typeof customElements !== "undefined" && !customElements.get("booki-agent-cursor")) {
  customElements.define("booki-agent-cursor", BookiAgentCursorElement);
}
