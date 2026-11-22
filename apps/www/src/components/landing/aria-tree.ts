/**
 * Accessibility-tree text for a subtree, in the shape browser automation tools
 * hand to a model: role, name, ref, value. Kept deliberately compact (rows and
 * cells are flattened, as the leanest tools do) so the comparison does not
 * flatter Booki. Returns the text and the element behind each ref.
 */
export function ariaTree(root: HTMLElement): {
  text: string;
  refs: Map<string, HTMLElement>;
} {
  const out: string[] = [];
  const refs = new Map<string, HTMLElement>();
  let count = 0;

  const ref = (el: HTMLElement) => {
    count += 1;
    const id = `e${count}`;
    refs.set(id, el);
    return `[ref=${id}]`;
  };
  const ownText = (el: Element) =>
    [...el.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent?.trim() ?? "")
      .join(" ")
      .trim();
  const nameOf = (el: HTMLElement) =>
    el.getAttribute("aria-label") ??
    ((el as HTMLInputElement).labels?.[0] ? ownText((el as HTMLInputElement).labels![0]!) : "");

  function walk(el: Element, depth: number) {
    const pad = "  ".repeat(depth);
    const line = (text: string) => out.push(`${pad}- ${text}`);
    const children = (next = depth + 1) => {
      for (const child of el.children) walk(child, next);
    };

    if (el instanceof HTMLFormElement) {
      line(`form "${el.getAttribute("aria-label") ?? ""}":`);
      children();
    } else if (el instanceof HTMLLabelElement) {
      const text = ownText(el);
      if (text) line(`text: ${text}`);
      children(depth);
    } else if (el instanceof HTMLSelectElement) {
      line(`combobox "${nameOf(el)}" ${ref(el)}:`);
      for (const option of el.options) {
        out.push(`${pad}  - option "${option.text}"${option.selected ? " [selected]" : ""}`);
      }
    } else if (el instanceof HTMLInputElement) {
      line(`textbox "${nameOf(el)}" ${ref(el)}${el.value ? `: ${el.value}` : ""}`);
    } else if (el instanceof HTMLButtonElement) {
      line(`button "${el.textContent?.trim()}" ${ref(el)}${el.disabled ? " [disabled]" : ""}`);
    } else if (el instanceof HTMLTableElement) {
      line("table:");
      children();
    } else if (el instanceof HTMLTableCellElement && el.tagName === "TH") {
      line(`columnheader "${el.textContent?.trim()}"`);
    } else if (el instanceof HTMLOutputElement) {
      const text = el.textContent?.trim();
      if (text) line(`status: ${text}`);
    } else {
      children(depth);
    }
  }

  walk(root, 0);
  return { text: out.join("\n"), refs };
}
