import type { Call } from "./scripted.js";

export type Surface = {
  text: string[];
  textSections: (string | null)[];
  controls: { key: string; name: string; enabled: boolean }[];
};

export type BridgeEntry = {
  ref: string;
  component?: string;
  label?: string;
  actions?: string[];
  content?: string;
};

export function normalizeSurface(text: string) {
  return text
    .normalize("NFC")
    .replace(/[\u00ad\u200b]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Runs only in the verifier. Values never flow to either model adapter. */
export function readRenderedSurface(doc: Document): Surface {
  const root = doc.querySelector<HTMLElement>("[data-public-document]");
  if (!root) throw new Error("Expected the document fixture to be rendered");
  const text: string[] = [];
  const textSections: (string | null)[] = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const rect = doc.createRange();

  const rendered = (element: Element) => {
    if (element.closest('[aria-hidden="true"], [hidden], script, style, noscript')) return false;
    const display = doc.defaultView?.getComputedStyle(element);
    return display?.visibility !== "hidden" && display?.visibility !== "collapse";
  };
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim() || !node.parentElement || !rendered(node.parentElement)) continue;
    rect.selectNodeContents(node);
    if (rect.getClientRects().length > 0) {
      text.push(node.textContent);
      textSections.push(node.parentElement.closest("[data-public-section]")?.getAttribute("aria-label") ?? null);
    }
  }

  const controlSelector =
    "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=switch],[role=checkbox],[role=radio]";
  const controls = Array.from(root.querySelectorAll<HTMLElement>("[data-public-key]"))
    .filter((element) => element.matches(controlSelector) && rendered(element) && element.getClientRects().length > 0)
    .map((element) => {
      const labelIds = element.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
      const labelledBy = labelIds
        .map((id) => doc.getElementById(id)?.textContent?.trim())
        .filter(Boolean)
        .join(" ");
      const associatedLabel =
        "labels" in element && element.labels instanceof NodeList
          ? Array.from(element.labels, (label) => (label as HTMLLabelElement).textContent?.trim())
              .filter(Boolean)
              .join(" ")
          : "";
      const name =
        labelledBy ||
        element.getAttribute("aria-label") ||
        associatedLabel ||
        element.innerText?.trim() ||
        element.querySelector("img[alt]")?.getAttribute("alt") ||
        element.getAttribute("title") ||
        element.getAttribute("placeholder") ||
        "";
      return {
        key: element.dataset.publicKey ?? "",
        name,
        enabled: !element.matches(':disabled,[aria-disabled="true"]') && !element.closest("[inert]"),
      };
    });
  return { text, controls, textSections };
}

function stringsFrom(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsFrom);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringsFrom);
  return [];
}

export function bridgeEntries(decision: Call): BridgeEntry[] {
  const values: unknown = JSON.parse(decision.output);
  return Array.isArray(values) ? (values as BridgeEntry[]) : [];
}

export function auditBridgeSurface(surface: Surface, outputs: Call[]) {
  const entries = [...new Map(outputs.flatMap(bridgeEntries).map((entry) => [entry.ref, entry])).values()];
  const contents = entries.flatMap((entry) =>
    entry.component === "public-document-section" ? stringsFrom(entry.content) : [],
  );
  const availableText = normalizeSurface([...contents, ...entries.flatMap((entry) => entry.label ?? [])].join(" "));
  const missingText = [...new Set(surface.text.map(normalizeSurface))].filter(
    (line) => line && !availableText.includes(line),
  );

  const actionable = entries
    .filter((entry) => entry.actions?.length)
    .map((entry) => normalizeSurface(entry.label ?? ""));
  const missingControls = surface.controls.filter(({ name, enabled }) => {
    if (!enabled) return false;
    const label = normalizeSurface(name);
    const index = actionable.findIndex((action) => label && (action === label || action.endsWith(` · ${label}`)));
    if (index < 0) return true;
    actionable.splice(index, 1);
    return false;
  });
  return {
    textNodes: surface.text.length,
    controls: surface.controls.length,
    enabledControls: surface.controls.filter(({ enabled }) => enabled).length,
    readableSections: contents.length,
    missingText,
    missingControls,
  };
}

export function auditSurfaceParity(browser: Surface, booki: Surface) {
  const canonicalControls = (surface: Surface) =>
    surface.controls.map(({ name, key, enabled }) => ({ name: normalizeSurface(name), key, enabled }));
  const repeatable = (surface: Surface) => normalizeSurface(surface.text.join(" "));
  return {
    textMatches: repeatable(browser) === repeatable(booki),
    controlsMatch: JSON.stringify(canonicalControls(browser)) === JSON.stringify(canonicalControls(booki)),
  };
}
