import {
  ToolbarButton,
  ToolbarInput,
  ToolbarLink,
  ToolbarGroup as SdkToolbarGroup,
  Toolbar as SdkToolbar,
  ToolbarSeparator as SdkToolbarSeparator,
} from "@ui-sdk/react/toolbar";
import { Children, Fragment, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";

/**
 * A line between sets of items in a `Toolbar`. It runs across the toolbar and
 * is skipped by the arrow keys.
 */
export function ToolbarSeparator(props: ComponentProps<typeof SdkToolbarSeparator>) {
  return <SdkToolbarSeparator {...props} />;
}

export type ToolbarGroupProps = Omit<ComponentProps<typeof SdkToolbarGroup>, "aria-label" | "children"> & {
  /** Names the set, like "Export". */
  label: string;
  children?: ReactNode;
};

/** A named set of related items inside a `Toolbar`. `disabled` disables every item in it. */
export function ToolbarGroup({ label, children, ...props }: ToolbarGroupProps) {
  return (
    <SdkToolbarGroup {...props} aria-label={label}>
      {join(children)}
    </SdkToolbarGroup>
  );
}

const OWN = new Set<unknown>([
  ToolbarButton,
  ToolbarInput,
  ToolbarLink,
  SdkToolbarGroup,
  SdkToolbarSeparator,
  ToolbarGroup,
  ToolbarSeparator,
]);

/**
 * Puts each item on the toolbar's roving focus: a button or a component (an
 * `IconButton`, a button of your own) through the toolbar's button part, an `<a>`
 * through its link part and an `<input>` through its field part. Text and other
 * plain elements are left as they are.
 */
function join(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (!isValidElement(child)) return child;
    const element = child as ReactElement<{ children?: ReactNode }>;
    if (element.type === Fragment) return join(element.props.children);
    if (OWN.has(element.type)) return element;
    if (element.type === "a") return <ToolbarLink key={element.key} render={element as never} />;
    if (element.type === "input") return <ToolbarInput key={element.key} render={element as never} />;
    if (typeof element.type === "string" && element.type !== "button") return element;
    return <ToolbarButton key={element.key} render={element as never} />;
  });
}

export type ToolbarProps = Omit<ComponentProps<typeof SdkToolbar>, "aria-label" | "children"> & {
  /** Names the toolbar, like "Invoice actions". Required: the agent and a screen reader read it. */
  label: string;
  /** The items: `IconButton`s, buttons, links, `ToolbarGroup`s and `ToolbarSeparator`s. */
  children?: ReactNode;
};

/**
 * A row of actions with one tab stop: Tab enters it, the arrow keys move between
 * its items (Home and End jump to the ends), and the next Tab leaves. It wraps
 * onto more lines when narrow. On the agent's bridge it is one `toolbar` entry
 * that lists its buttons by name, and the agent presses one by that name; each
 * button keeps its own entry and its `data-agent-confirm` gate.
 * `data-slot="toolbar"`; Booki's look keys on `[data-slot="toolbar"][data-booki-toolbar]`.
 */
export function Toolbar({ label, children, ...props }: ToolbarProps) {
  return (
    <SdkToolbar {...props} aria-label={label} data-booki-toolbar="">
      {join(children)}
    </SdkToolbar>
  );
}
