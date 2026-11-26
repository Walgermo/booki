import { Button as SdkButton } from "@ui-sdk/react/button";
import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "sm" | "md";

export type ButtonProps = ComponentProps<typeof SdkButton> & {
  /**
   * How much it stands out. `primary` (default) is ink on paper, for the one action
   * that matters most in a section. `secondary` is a raised card with a ring, for the
   * other choices. `ghost` is plain text with a hover tint, for a quiet action inside
   * another surface (Copy, Reset).
   */
  variant?: ButtonVariant;
  /** `md` (default) is the control height. `sm` looks smaller but keeps a 40px hit area. */
  size?: ButtonSize;
};

/**
 * A plain button with Booki's look. It is ui-sdk's Button underneath, so an agent
 * finds it in the snapshot by its text and presses it over the bridge, and
 * `data-agent-confirm`, `disabled` and a pending `onClick` (return a Promise) work
 * as on any button. `type` defaults to `"button"`, so it never submits a form by
 * accident. It keeps ui-sdk's `data-slot="button"` and adds `data-booki-button`,
 * `data-variant` and `data-size`; style it as `[data-slot="button"][data-booki-button]`.
 */
export function Button({ variant = "primary", size = "md", type = "button", ...props }: ButtonProps) {
  return <SdkButton type={type} {...props} data-booki-button="" data-variant={variant} data-size={size} />;
}
