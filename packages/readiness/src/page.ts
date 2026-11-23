/**
 * Code that runs inside the page. Each function is serialised by Playwright,
 * so it must not use anything from module scope.
 */

/** What the report says about one element. */
export type ElementInfo = {
  tag: string;
  selector: string;
  html: string;
  /** Visible text near the element: a column header, a preceding label. */
  context: string;
  type: string | null;
  /** True when the element or an ancestor carries data-agent-confirm. */
  confirm: string | null;
  /** True when the element or an ancestor carries data-agent-secret. */
  secret: boolean;
  /** The element or a descendant uses an icon font, by family or class. */
  iconFont: boolean;
  disabled: boolean;
  /**
   * Out of reach of a person and an agent: aria-hidden or inert on it or an
   * ancestor, type="hidden", not rendered, or visually hidden and out of the
   * tab order (the native input a UI library puts beside a custom control).
   */
  hidden: boolean;
};

/**
 * Makes a function that runs in the page carry its own `__name` helper.
 *
 * esbuild with `keepNames` (tsx, and any bundler of the caller's that turns it
 * on) wraps inner functions in `__name(fn, "name")`, a helper defined in the
 * module, not in the page. Playwright sends only the function's source, so in
 * a page that has no `__name` of its own the call throws. The function this
 * returns has the original's source inside a wrapper that defines the helper,
 * and Playwright serialises that whole source.
 */
export function inPage<F extends (...args: never[]) => unknown>(fn: F): F {
  const source = `(...args) => { const __name = (target) => target; return (${fn.toString()})(...args); }`;
  return new Function(`return ${source}`)() as F;
}

/**
 * Runs before any page script. Records WebMCP tool registrations when the
 * browser has no WebMCP of its own.
 *
 * A tool is kept once by name, the latest registration winning, and leaves
 * when the signal it was registered with aborts. ui-sdk's registerTools
 * unregisters by aborting, so React's development double effect (register,
 * clean up, register) and a hot reload register each tool again; without
 * this the report listed every tool twice.
 */
export const INIT_SCRIPT = `(() => {
  const tools = [];
  Object.defineProperty(globalThis, "__readinessTools", { value: tools, configurable: true });
  const add = (tool) => {
    if (!tool || typeof tool !== "object") return;
    const i = tools.findIndex((t) => t.name === tool.name);
    if (i >= 0) tools.splice(i, 1, tool); else tools.push(tool);
  };
  const context = {
    registerTool(tool, options) {
      const signal = options && options.signal;
      if (signal && signal.aborted) return Promise.resolve();
      add(tool);
      if (signal && typeof signal.addEventListener === "function") {
        signal.addEventListener("abort", () => { const i = tools.indexOf(tool); if (i >= 0) tools.splice(i, 1); }, { once: true });
      }
      return Promise.resolve();
    },
    unregisterTool(name) { const i = tools.findIndex((t) => t.name === name); if (i >= 0) tools.splice(i, 1); return Promise.resolve(); },
    provideContext(value) { tools.length = 0; for (const tool of (value && value.tools) || []) add(tool); return Promise.resolve(); },
    clearContext() { tools.length = 0; return Promise.resolve(); },
  };
  try { if (!document.modelContext) Object.defineProperty(document, "modelContext", { value: context, configurable: true }); } catch {}
  try { if (!navigator.modelContext) Object.defineProperty(navigator, "modelContext", { value: context, configurable: true }); } catch {}
})();`;

export function describeElement(element: Element): ElementInfo {
  const cssEscape = (value: string) =>
    typeof CSS !== "undefined" && typeof CSS.escape === "function"
      ? CSS.escape(value)
      : value.replace(/[^\w-]/g, "\\$&");
  const selectorOf = (el: Element): string => {
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      if (
        node.id &&
        !/^(ui-sdk-|:r|_r)/.test(node.id) &&
        document.querySelectorAll(`#${cssEscape(node.id)}`).length === 1
      ) {
        parts.unshift(`#${cssEscape(node.id)}`);
        break;
      }
      let part = node.tagName.toLowerCase();
      const slot = node.getAttribute("data-slot");
      const role = node.getAttribute("role");
      if (slot) part += `[data-slot="${slot}"]`;
      else if (role) part += `[role="${role}"]`;
      const parent: Element | null = node.parentElement;
      if (parent) {
        const same = [...parent.children].filter((child) => child.tagName === node!.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      if (node.tagName === "BODY") break;
      node = parent;
    }
    return parts.join(" > ");
  };

  const clean = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

  const contextOf = (el: Element): string => {
    // A table cell's column header.
    const cell = el.closest("td, [role=cell], [role=gridcell]");
    if (cell) {
      const row = cell.parentElement;
      const table = cell.closest("table, [role=table], [role=grid]");
      const index = row ? [...row.children].indexOf(cell) : -1;
      const header = table?.querySelectorAll("thead th, [role=columnheader]")[index];
      if (header && clean(header.textContent)) return clean(header.textContent).slice(0, 60);
    }
    // Otherwise by layout: the closest plain text to the left on the same
    // line, else the closest above in the same column (a header row).
    const box = el.getBoundingClientRect();
    const midY = box.top + box.height / 2;
    const midX = box.left + box.width / 2;
    const interactive = "a, button, input, select, textarea, [role], [contenteditable]";
    let left: { text: string; distance: number } | null = null;
    let above: { text: string; distance: number } | null = null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = clean(node.textContent);
      const parent = node.parentElement;
      if (!text || text.length > 80 || !parent || el.contains(parent)) continue;
      if (parent.closest(interactive) && !parent.closest("label, th, [role=columnheader]")) continue;
      if (parent.closest("[aria-hidden=true]")) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.right <= box.left + 4 && r.top <= midY && r.bottom >= midY) {
        const distance = box.left - r.right;
        if (distance < 240 && (!left || distance < left.distance)) left = { text, distance };
      } else if (r.bottom <= box.top + 2 && r.left <= midX + 8 && r.right >= box.left - 8) {
        const distance = box.top - r.bottom;
        if (distance < 320 && (!above || distance < above.distance)) above = { text, distance };
      }
    }
    return (left ?? above)?.text ?? "";
  };

  const iconPattern = /material|icon|symbol|awesome|glyph/i;
  const usesIconFont = (el: Element): boolean => {
    const candidates = [el, ...el.querySelectorAll("*")].slice(0, 6);
    return candidates.some((candidate) => {
      const family = getComputedStyle(candidate).fontFamily;
      const classes = typeof candidate.className === "string" ? candidate.className : "";
      return (
        iconPattern.test(family) ||
        /(^|\s)(material-(icons|symbols)[\w-]*|icon[\w-]*|[\w-]+-icon|fa|fa-[\w-]+|glyphicon[\w-]*)(\s|$)/i.test(
          classes,
        )
      );
    });
  };

  const html = (el: Element) => {
    const copy = el.cloneNode(true) as Element;
    const text = copy.outerHTML.replace(/\s+/g, " ");
    return text.length > 220 ? `${text.slice(0, 217)}…` : text;
  };

  const hiddenFromPeople = (el: Element): boolean => {
    if (el.getAttribute("type")?.toLowerCase() === "hidden" && el.tagName === "INPUT") return true;
    if (el.closest("[aria-hidden=true], [inert]")) return true;
    if (el instanceof HTMLElement && el.hidden) return true;
    for (let node: Element | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return true;
    }
    // Visually hidden and not reachable with Tab: no person can get to it.
    if ((el as HTMLElement).tabIndex < 0) {
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const clipped = /rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)/.test(style.clip) || style.clipPath === "inset(50%)";
      if (Number(style.opacity) === 0 || box.width <= 1 || box.height <= 1 || clipped) return true;
    }
    return false;
  };

  const confirmHost = element.closest("[data-agent-confirm]");
  return {
    tag: element.tagName.toLowerCase(),
    selector: selectorOf(element),
    html: html(element),
    context: contextOf(element),
    type: element.getAttribute("type"),
    confirm: confirmHost ? confirmHost.getAttribute("data-agent-confirm") || "(marked)" : null,
    secret: element.closest("[data-agent-secret]") !== null,
    iconFont: usesIconFont(element),
    disabled: (element as HTMLButtonElement).disabled === true || element.getAttribute("aria-disabled") === "true",
    hidden: hiddenFromPeople(element),
  };
}

export type ChartInfo = ElementInfo & {
  kind: "canvas" | "svg";
  width: number;
  height: number;
  name: string;
  /** Numbers found in the chart's name, description, fallback or a table beside it. */
  figures: number;
  role: string | null;
};

/** Finds canvas and SVG charts an agent can see, with what text they carry. */
export function findCharts(): Array<Omit<ChartInfo, keyof ElementInfo> & { index: number }> {
  const clean = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
  const countFigures = (text: string) => (text.match(/\d[\d\s.,]*\d|\d/g) ?? []).length;
  const textOfIds = (ids: string | null) =>
    clean(
      (ids ?? "")
        .split(/\s+/)
        .map((id) => (id ? (document.getElementById(id)?.textContent ?? "") : ""))
        .join(" "),
    );
  const hidden = (el: Element) => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      if (node.getAttribute("aria-hidden") === "true") return true;
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return true;
    }
    return false;
  };

  const out: Array<Omit<ChartInfo, keyof ElementInfo> & { index: number }> = [];
  const all = [...document.querySelectorAll("canvas, svg")];
  all.forEach((el, index) => {
    if (el.tagName.toLowerCase() === "svg" && el.parentElement?.closest("svg")) return; // nested svg
    if (el.closest("button, a, [role=button], [role=link], [role=menuitem], [role=tab]")) return; // an icon
    if (hidden(el)) return;
    const box = el.getBoundingClientRect();
    const kind = el.tagName.toLowerCase() === "canvas" ? "canvas" : "svg";
    if (
      kind === "canvas"
        ? box.width < 32 || box.height < 16
        : Math.max(box.width, box.height) < 48 || Math.min(box.width, box.height) < 12
    )
      return;
    if (kind === "svg") {
      const marks = el.querySelectorAll("rect, path, circle, line, polyline, polygon, ellipse").length;
      if (marks < 3) return; // a logo or a single icon
    }
    const role = el.getAttribute("role");
    if (role === "presentation" || role === "none") return;
    const title = kind === "svg" ? clean(el.querySelector(":scope > title")?.textContent) : "";
    const name = clean(el.getAttribute("aria-label")) || textOfIds(el.getAttribute("aria-labelledby")) || title;
    const description =
      textOfIds(el.getAttribute("aria-describedby")) +
      " " +
      clean(el.getAttribute("aria-description")) +
      " " +
      (kind === "svg" ? clean(el.querySelector(":scope > desc")?.textContent) : clean(el.textContent));
    // A data table in the same figure or widget counts as the figures being in the DOM.
    const host = el.parentElement?.closest(
      "figure, [role=figure], [role=img], [role=group], [role=region], section, article",
    );
    const table = host?.querySelector("table, [role=table], [role=grid]");
    const tableText = table ? clean(table.textContent) : "";
    const figures =
      countFigures(`${name} ${description}`) + (table && !el.contains(table) ? countFigures(tableText) : 0);
    out.push({ index, kind, width: Math.round(box.width), height: Math.round(box.height), name, figures, role });
  });
  return out;
}

/** Reads the page's agent bridge, through window.agent or its WebMCP snapshot tool. */
export async function readBridge(): Promise<{
  source: "window.agent" | "webmcp" | null;
  components: Array<{
    ref?: string;
    component?: string;
    label?: string;
    actions?: string[];
    confirm?: string;
    offPage?: boolean;
  }>;
  tools: string[];
  error: string | null;
}> {
  const g = globalThis as unknown as {
    agent?: { snapshot?: () => unknown };
    __readinessTools?: Array<{ name: string; execute?: (input: unknown) => unknown }>;
  };
  // Once each: a page may register a tool on both document and navigator, or again on a re-render.
  const tools = [...new Set((g.__readinessTools ?? []).map((tool) => String(tool.name)))];
  const toList = (value: unknown): unknown[] => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      const v = value as { components?: unknown; content?: Array<{ type: string; text?: string }> };
      if (Array.isArray(v.components)) return v.components;
      const text = v.content?.find((part) => part.type === "text")?.text;
      if (text) {
        try {
          return toList(JSON.parse(text));
        } catch {
          return [];
        }
      }
    }
    return [];
  };
  try {
    if (typeof g.agent?.snapshot === "function") {
      const components = toList(await g.agent.snapshot()) as never[];
      return { source: "window.agent", components, tools, error: null };
    }
    const snapshotTool = (g.__readinessTools ?? []).find((tool) => tool.name === "snapshot");
    if (snapshotTool?.execute) {
      const components = toList(await snapshotTool.execute({})) as never[];
      return { source: "webmcp", components, tools, error: null };
    }
    return { source: tools.length ? "webmcp" : null, components: [], tools, error: null };
  } catch (error) {
    return { source: null, components: [], tools, error: String(error) };
  }
}

/** How a field relates to the bridge's components. */
export type BridgeCoverage = {
  /** The field is inside the root element of a bridge component. */
  inRoot: boolean;
  /** The field is inside data-agent-hidden: kept from the agent on purpose. */
  agentHidden: boolean;
  /** For a radio: its group, named by aria-labelledby, aria-label or a legend. */
  group: { name: string; covered: boolean } | null;
};

/**
 * Whether a field is inside a bridge component's root element.
 *
 * ui-sdk writes a component's kind (the snapshot entry's `component`) as
 * `data-slot` on its root part, and `<kind>-<slot>` on its other parts; its
 * `elementOf(ref)` gives the root, or the first part when the root is not
 * rendered, but only to code inside the app. From outside, the snapshot does
 * not say which element belongs to which entry, so the outermost elements of
 * a kind all count when the page has no more of them (outside
 * data-agent-hidden) than the snapshot has entries of that kind; otherwise
 * only one whose name is the label of an entry of that kind counts.
 */
export function bridgeCoverage(element: Element, entries: Array<{ component: string; label: string }>): BridgeCoverage {
  const clean = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();
  const norm = (text: string | null | undefined) => clean(text).toLowerCase();
  const textOfIds = (ids: string | null) =>
    (ids ?? "")
      .split(/\s+/)
      .map((id) => (id ? (document.getElementById(id)?.textContent ?? "") : ""))
      .join(" ");
  const nameOf = (el: Element): string => {
    const labelledby = clean(textOfIds(el.getAttribute("aria-labelledby")));
    if (labelledby) return labelledby;
    const label = clean(el.getAttribute("aria-label"));
    if (label) return label;
    if (el.tagName === "FIELDSET") return clean(el.querySelector(":scope > legend")?.textContent);
    const labels = (el as HTMLInputElement).labels;
    if (labels?.length) return clean([...labels].map((l) => l.textContent).join(" "));
    return "";
  };
  const quote = (value: string) => `"${value.replace(/["\\]/g, "\\$&")}"`;

  const counts = new Map<string, number>();
  const labelsOf = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (!entry.component) continue;
    counts.set(entry.component, (counts.get(entry.component) ?? 0) + 1);
    const labels = labelsOf.get(entry.component) ?? new Set<string>();
    if (norm(entry.label)) labels.add(norm(entry.label));
    labelsOf.set(entry.component, labels);
  }
  const roots: Element[] = [];
  for (const [kind, labels] of labelsOf) {
    // The root part, or the outermost parts when the root is not rendered
    // (a control that wraps ui-sdk's parts in an element of its own).
    const parts = [...document.querySelectorAll(`[data-slot=${quote(kind)}], [data-slot^=${quote(`${kind}-`)}]`)];
    const found = parts.filter(
      (el) => !el.closest("[data-agent-hidden]") && !parts.some((other) => other !== el && other.contains(el)),
    );
    if (found.length <= (counts.get(kind) ?? 0)) roots.push(...found);
    else roots.push(...found.filter((el) => labels.has(norm(nameOf(el)))));
  }
  const inside = (el: Element) => roots.some((root) => root.contains(el));
  const allLabels = new Set(entries.map((entry) => norm(entry.label)).filter(Boolean));

  let group: BridgeCoverage["group"] = null;
  const isRadio =
    element.getAttribute("role") === "radio" ||
    (element.tagName === "INPUT" && (element as HTMLInputElement).type === "radio");
  if (isRadio) {
    const host = element.closest("[role=radiogroup], fieldset, [role=group]");
    const name = host ? nameOf(host) : "";
    if (host && name) group = { name, covered: allLabels.has(norm(name)) || inside(host) };
  }
  return { inRoot: inside(element), agentHidden: element.closest("[data-agent-hidden]") !== null, group };
}

/**
 * Elements a person reaches with Tab or a click that the accessibility tree
 * gives no control role: a table cell with tabindex that opens an editor, a
 * div that acts as a button. Returns indices into `[tabindex]`.
 */
export function findFocusableNonControls(): Array<{ index: number; tag: string; text: string }> {
  const native =
    "a[href], button, input, select, textarea, summary, details, iframe, audio, video, [contenteditable=''], [contenteditable=true]";
  const neutral = new Set([
    "",
    "generic",
    "none",
    "presentation",
    "cell",
    "row",
    "text",
    "paragraph",
    "listitem",
    "group",
  ]);
  const out: Array<{ index: number; tag: string; text: string }> = [];
  [...document.querySelectorAll("[tabindex]")].forEach((el, index) => {
    if ((el as HTMLElement).tabIndex < 0) return;
    if (el.matches(native) || el.tagName.toLowerCase() === "svg" || el.tagName.toLowerCase() === "canvas") return;
    const role = (el.getAttribute("role") ?? "").trim().toLowerCase();
    if (!neutral.has(role)) return;
    for (let node: Element | null = el; node; node = node.parentElement) {
      if (node.getAttribute("aria-hidden") === "true") return;
    }
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return;
    // A scroll container made focusable for keyboard scrolling.
    if (
      /(auto|scroll)/.test(style.overflow + style.overflowY + style.overflowX) &&
      el.scrollHeight > el.clientHeight + 1
    )
      return;
    // A dialog or region that takes focus programmatically is not a control.
    if (el.matches("[role=dialog], dialog, main, [aria-modal]")) return;
    out.push({
      index,
      tag: el.tagName.toLowerCase(),
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
    });
  });
  return out;
}

/** True when every place the value appears on the page is inside [data-agent-secret]. */
export function onlyInSecrets(value: string): boolean {
  const digits = (text: string) => text.replace(/[^0-9A-Za-z]/g, "");
  const wanted = digits(value);
  let found = 0;
  let marked = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!digits(node.textContent ?? "").includes(wanted)) continue;
    found++;
    if (node.parentElement?.closest("[data-agent-secret]")) marked++;
  }
  for (const input of document.querySelectorAll("input, textarea")) {
    if (!digits((input as HTMLInputElement).value).includes(wanted)) continue;
    found++;
    if (input.closest("[data-agent-secret]")) marked++;
  }
  return found > 0 && found === marked;
}
