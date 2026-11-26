import { FieldControl, FieldDescription, FieldError, FieldLabel, Field as SdkField } from "@ui-sdk/react/field";
import { Input } from "@ui-sdk/react/input";
import { Textarea } from "@ui-sdk/react/textarea";
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";

/** Native input types an agent may fill as text. Others (password, checkbox, file…) stay out of its reach. */
const TEXT_TYPES = new Set(["text", "email", "tel", "url", "search"]);

export type FieldProps = Omit<ComponentProps<typeof SdkField>, "children" | "invalid" | "render"> & {
  /** Names the control, for people, a screen reader and the agent. */
  label: ReactNode;
  /** A hint under the control. It describes it (`aria-describedby`). */
  help?: ReactNode;
  /**
   * What is wrong, in the person's words ("Enter nine digits"). Shown under the
   * control and read with it; the field shows as invalid while it is set. Without
   * it the browser's own message shows after a submit finds the control invalid.
   */
  errorText?: ReactNode;
  /** Force the invalid look on or off. Default: on while `errorText` is set, else the browser decides. */
  invalid?: boolean;
  /**
   * One control. A plain `<input>` (text, email, tel, url, search) or
   * `<textarea>` is wired up so the agent can fill it by this label; a `<select>`
   * or another input type is wired for people and screen readers only. A Booki
   * control with its own label does not go in a Field.
   */
  children: ReactNode;
};

/** Connects a plain control to the field: its id, `aria-labelledby`, `aria-describedby` and `aria-invalid`. */
function wire(child: ReactNode): ReactNode {
  if (!isValidElement(child) || typeof child.type !== "string") return child;
  const element = child as ReactElement<{ type?: string }>;
  if (element.type === "textarea") return <Textarea key={element.key} render={element as never} />;
  if (element.type === "input" && TEXT_TYPES.has(element.props.type ?? "text")) {
    return <Input key={element.key} render={element as never} />;
  }
  if (element.type === "input" || element.type === "select") {
    return <FieldControl key={element.key} render={element as never} />;
  }
  return child;
}

/**
 * A label, one control, a hint and an error, wired together: the label names
 * the control, the hint and the error describe it, and an invalid field marks
 * its control `aria-invalid`. A plain text input inside becomes one the agent
 * reads by the label and fills with `setValue`. The error is text you pass,
 * never agent state. `data-slot="field"`, with Booki's base look for the label,
 * the control and the text under it.
 */
export function Field({ label, help, errorText, invalid, children, ...props }: FieldProps) {
  const hasError = errorText !== undefined && errorText !== null && errorText !== false;
  return (
    <SdkField {...props} invalid={invalid ?? (hasError ? true : undefined)} data-booki="" data-booki-field="">
      <FieldLabel>{label}</FieldLabel>
      {Children.map(children, wire)}
      {help ? <FieldDescription>{help}</FieldDescription> : null}
      {hasError ? <FieldError match>{errorText}</FieldError> : <FieldError />}
    </SdkField>
  );
}
