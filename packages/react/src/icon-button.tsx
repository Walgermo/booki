import { Button } from "@ui-sdk/react/button";
import type { ComponentProps, ReactNode } from "react";

export type IconButtonProps = Omit<ComponentProps<typeof Button>, "children" | "aria-label" | "aria-labelledby"> & {
  /**
   * What pressing it does, like "Delete line 2". Required: an icon is not a name.
   * The agent's bridge, a screen reader and the tooltip all read these words.
   */
  label: string;
  /** Any icon element: `<TrashIcon />` from @booki-aui/icons/react, or one of your own. */
  icon: ReactNode;
  /** Show the label as text beside the icon, for wide layouts. Default: the icon alone, the label as its name and tooltip. */
  showLabel?: boolean;
};

/**
 * A button that shows an icon and is still named by what it does. The icon is
 * hidden from assistive technology and the agent; the label is the button's
 * name, so an agent presses it by its words (`press "Delete line 2"`) and never
 * meets a nameless button. It is ui-sdk's Button underneath: on the bridge,
 * `data-agent-confirm` and a pending state work as they do on any button. It keeps
 * ui-sdk's `data-slot="button"`; style it as `[data-slot="button"][data-icon-button]`.
 */
export function IconButton({ label, icon, showLabel = false, title, ...props }: IconButtonProps) {
  return (
    <Button
      type="button"
      {...props}
      data-icon-button=""
      data-show-label={showLabel ? "" : undefined}
      aria-label={showLabel ? undefined : label}
      title={title ?? (showLabel ? undefined : label)}
    >
      <span data-slot="icon-button-icon" aria-hidden="true">
        {icon}
      </span>
      {showLabel ? <span data-slot="icon-button-label">{label}</span> : null}
    </Button>
  );
}
