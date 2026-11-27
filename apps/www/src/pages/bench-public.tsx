import { Button, createParts, definePrimitive } from "@booki-aui/react";
import { Checkbox } from "@ui-sdk/react/checkbox";
import { Input } from "@ui-sdk/react/input";
import { createElement, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import capturedJson from "@/data/public-documents.json?raw";
import { documentIndex, type DocumentNode, type PublicRoute } from "@/lib/public-document-model";
import { publicTasks, type PublicTask } from "@/lib/public-browser-run";

const { routes } = JSON.parse(capturedJson) as { routes: Record<string, PublicRoute> };
const readSection = definePrimitive({
  name: "public-document-section",
  options: { content: "string" },
  controlled: ["content"],
  state: (options: { content?: string }) => ({ content: options.content ?? "" }),
  api: (context) => {
    context.onOptions((options) => context.store.set({ content: options.content ?? "" }));
    return {};
  },
  slots: (slot) => ({ root: slot({}) }),
  agent: { actions: [] },
});
const Section = createParts(readSection, { root: "section" }).Root;
const voidTags = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
const inertMedia = new Set(["iframe", "object", "embed", "picture", "video", "audio", "source", "track", "canvas"]);
const htmlNames: Record<string, string> = {
  for: "htmlFor",
  tabindex: "tabIndex",
  colspan: "colSpan",
  rowspan: "rowSpan",
  datetime: "dateTime",
  readonly: "readOnly",
  autocomplete: "autoComplete",
  inputmode: "inputMode",
  contenteditable: "contentEditable",
};
const bools = new Set(["disabled", "readonly", "multiple", "required", "open", "reversed", "inert"]);
function attributes(node: DocumentNode) {
  const props: Record<string, string | boolean> = { "data-public-key": node.key };
  for (const [name, value] of Object.entries(node.attrs ?? {})) {
    if (
      name.startsWith("aria-") ||
      /^(id|role|href|type|name|lang|dir|for|headers|title|alt|scope|colspan|rowspan|placeholder|tabindex|datetime|value|min|max|step|start|inputmode|autocomplete|contenteditable)$/.test(
        name,
      )
    )
      props[htmlNames[name] ?? name] = value;
    if (bools.has(name)) props[htmlNames[name] ?? name] = true;
  }
  if (node.hidden) props.hidden = true;
  return props;
}

function Fixture({ task, booki }: { task: PublicTask; booki: boolean }) {
  const [params, setParams] = useSearchParams();
  const route = routes[task];
  const [consent, setConsent] = useState("");
  const [notice, setNotice] = useState("");
  const view = params.get("view");
  const name =
    view === "guidance"
      ? params.has("expanded")
        ? "guidanceExpanded"
        : "guidance"
      : consent || !route.scenes.homeConsent
        ? "home"
        : "homeConsent";
  const scene = route.scenes[name] ?? route.scenes.guidance;
  const index = useMemo(() => documentIndex(scene), [scene]);
  const marker = {
    "data-public-fixture": task,
    "data-public-consent": consent,
    "data-public-title": publicTasks[task].start,
  };

  function activate(node: DocumentNode) {
    const transition = route.transitions.find((step) => step.from === name && step.key === node.key);
    setNotice("");
    if (transition?.to === "home") {
      setConsent("declined");
      return;
    }
    if (transition?.to === "guidance") {
      setParams({ view: "guidance" });
      return;
    }
    if (transition?.to === "guidanceExpanded") {
      setParams({ view: "guidance", expanded: "true" });
      return;
    }
    if (name === "guidanceExpanded" && index.controls.get(node.key)?.includes("Dagpenger · Vis mindre")) {
      setParams({ view: "guidance" });
      return;
    }
    if (name === "homeConsent" && ["Ja", "Godta alle"].includes(index.controls.get(node.key) ?? "")) {
      setConsent("accepted");
      return;
    }
    const source = node.attrs?.href;
    if (source && (source.startsWith("#") || source.startsWith(scene.url + "#"))) {
      document.getElementById(decodeURIComponent(source.split("#")[1] ?? ""))?.scrollIntoView();
      return;
    }
    setNotice("Denne handlingen er utenfor den innspilte ruten.");
  }

  function render(node: DocumentNode): ReactNode {
    const props = attributes(node);
    const isMain = node.tag === "main" || props.role === "main";
    let tag =
      node.tag === "body"
        ? "div"
        : isMain
          ? "main"
          : node.tag.includes("-") || inertMedia.has(node.tag)
            ? "div"
            : node.tag;
    if (isMain) Object.assign(props, marker);
    const label = index.controls.get(node.key);
    const children = node.children?.map((child) => (typeof child === "string" ? child : render(child)));
    const source = node.attrs ?? {};
    if (node.tag === "img")
      return createElement(
        "span",
        { key: node.key, hidden: node.hidden, role: "img", "aria-label": source.alt || undefined },
        source.alt,
      );
    if (label !== undefined) {
      if (label) props["aria-label"] = label;
      if (tag === "input" || tag === "textarea" || tag === "select") {
        if ("value" in props) {
          props.defaultValue = props.value;
          delete props.value;
        }
        if (tag === "input" && source.type === "checkbox") {
          const checked = source.checked !== undefined || source["aria-checked"] === "true";
          if (booki)
            return (
              <Checkbox
                key={node.key}
                data-public-key={node.key}
                id={source.id}
                name={source.name}
                aria-label={label}
                disabled={source.disabled !== undefined}
                defaultChecked={checked}
              />
            );
          props.defaultChecked = checked;
        }
        if (tag === "input" && booki && !["submit", "button", "checkbox", "radio", "file"].includes(source.type))
          return <Input key={node.key} {...(props as ComponentProps<typeof Input>)} />;
      } else {
        const onClick = (event: { preventDefault(): void }) => {
          event.preventDefault();
          activate(node);
        };
        if (tag !== "a" && tag !== "summary") tag = "button";
        if (booki)
          return (
            <Button key={node.key} {...props} variant="ghost" onClick={onClick} render={createElement(tag)}>
              {children}
            </Button>
          );
        return createElement(tag, { ...props, key: node.key, onClick }, children);
      }
    }
    const onSubmit =
      tag === "form"
        ? (event: { preventDefault(): void }) => {
            event.preventDefault();
            setNotice("Dette skjemaet er utenfor den innspilte ruten.");
          }
        : undefined;
    const section = index.sectionText.get(node.key);
    if (section && booki)
      return (
        <Section
          key={node.key}
          {...props}
          data-public-section={node.key}
          aria-label={section.label}
          content={section.content}
          render={createElement(tag, { onSubmit })}
        >
          {children}
        </Section>
      );
    return createElement(tag, { ...props, onSubmit, key: node.key }, ...(voidTags.has(tag) ? [] : [children]));
  }
  return (
    <div key={name} className="public-document" lang="nb" data-public-document={name}>
      {render(scene.tree)}
      {notice &&
        (booki ? (
          <Section aria-label="Rutegrense" content={notice} render={<p role="status" />}>
            {notice}
          </Section>
        ) : (
          <p role="status">{notice}</p>
        ))}
    </div>
  );
}

export function BenchPublicPage() {
  const { task, side } = useParams();
  if (!task || !(task in routes) || !(task in publicTasks) || (side !== "browser" && side !== "booki"))
    return (
      <main>
        <h1>Ukjent testside</h1>
      </main>
    );
  return <Fixture key={`${task}/${side}`} task={task as PublicTask} booki={side === "booki"} />;
}
