export type DocumentNode = {
  tag: string;
  key: string;
  attrs?: Record<string, string>;
  children?: (DocumentNode | string)[];
  hidden?: boolean;
  name?: string;
};

export type DocumentScene = {
  url: string;
  title: string;
  tree: DocumentNode;
  coverage: { sourceElements: number; capturedElements: number; hiddenElements: number };
};

export type PublicRoute = {
  scenes: Record<string, DocumentScene>;
  transitions: { from: string; to: string; key: string }[];
};

const sections = new Set([
  "body",
  "main",
  "header",
  "footer",
  "nav",
  "section",
  "article",
  "aside",
  "dialog",
  "table",
  "form",
]);
const landmarkNames: Record<string, string> = {
  body: "Dokument",
  main: "Hovedinnhold",
  article: "Artikkel",
  header: "Topptekst",
  footer: "Bunntekst",
  nav: "Navigasjon",
  aside: "Tilleggsinformasjon",
  form: "Skjema",
};
const blocks = new Set(["p", "div", "li", "dt", "dd", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "caption"]);

function textOf(node: DocumentNode): string {
  if (node.hidden) return "";
  return (node.children ?? []).map((child) => (typeof child === "string" ? child : textOf(child))).join(" ");
}

export function documentIndex(scene: DocumentScene) {
  const byId = new Map<string, DocumentNode>();
  const lookup = (node: DocumentNode) => {
    if (node.attrs?.id) byId.set(node.attrs.id, node);
    for (const child of node.children ?? []) if (typeof child !== "string") lookup(child);
  };
  lookup(scene.tree);
  const nameOf = (node: DocumentNode) => {
    const attrs = node.attrs ?? {};
    const labelled = attrs["aria-labelledby"]
      ?.split(/\s+/)
      .map((id) => byId.get(id))
      .filter((item) => item !== undefined)
      .map(textOf)
      .join(" ");
    return (
      node.name ||
      attrs["aria-label"] ||
      labelled ||
      textOf(node) ||
      attrs.alt ||
      attrs.title ||
      attrs.placeholder ||
      ""
    )
      .replace(/\s+/g, " ")
      .trim();
  };
  const sectionText = new Map<string, { label: string; content: string }>();
  const controls = new Map<string, string>();
  function visit(node: DocumentNode, parts: string[], region: string) {
    if (node.hidden) return;
    const attrs = node.attrs ?? {};
    const section = sections.has(node.tag) || ["region", "dialog", "navigation", "main"].includes(attrs.role);
    const own = section ? [] : parts;
    const heading = (node.children ?? []).find((child) => typeof child !== "string" && /^h[1-6]$/.test(child.tag));
    const label = section
      ? attrs["aria-label"] ||
        (attrs["aria-labelledby"] ? nameOf(node) : "") ||
        (heading && typeof heading !== "string" ? textOf(heading).trim() : "") ||
        (landmarkNames[node.tag] ? `${landmarkNames[node.tag]} · ${scene.title}` : region)
      : region;
    const elementName = controlKind(node) ? nameOf(node) : "";
    if (controlKind(node)) {
      controls.set(
        node.key,
        ["Vis mer", "Vis mindre"].includes(elementName) && label ? `${label} · ${elementName}` : elementName,
      );
    }
    if (node.tag === "img" && attrs.alt) own.push(attrs.alt);
    if (blocks.has(node.tag)) own.push("\n");
    if (node.tag === "td" || node.tag === "th") own.push(" | ");
    for (const child of node.children ?? []) {
      if (typeof child === "string") own.push(child);
      else visit(child, own, label);
    }
    if (blocks.has(node.tag)) own.push("\n");
    if (section) {
      const content = own
        .join(" ")
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("\n");
      if (content) sectionText.set(node.key, { label: label || scene.title, content });
    }
  }
  visit(scene.tree, [], scene.title);
  return { controls, sectionText };
}

export function controlKind(node: DocumentNode) {
  const attrs = node.attrs ?? {};
  if (node.tag === "input" && attrs.type === "hidden") return null;
  if (
    (node.tag === "a" && attrs.href) ||
    ["button", "summary"].includes(node.tag) ||
    ["button", "link", "tab", "menuitem"].includes(attrs.role) ||
    (node.tag === "input" && ["button", "submit", "reset"].includes(attrs.type))
  )
    return "press";
  if (
    ["input", "select", "textarea"].includes(node.tag) ||
    attrs.contenteditable === "true" ||
    ["textbox", "searchbox", "combobox", "checkbox", "radio", "switch"].includes(attrs.role)
  )
    return "field";
  return null;
}
