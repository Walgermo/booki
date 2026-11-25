import type { ComponentProps } from "react";

/**
 * Form participation shared by the composed Booki controls.
 *
 * - `name`: the control submits with a native `<form>` through a hidden input
 *   carrying its canonical value (minor units, digits, ISO date, code).
 * - `disabled`: not editable and not submitted, as in HTML.
 * - `readOnly`: shown and submitted, not editable.
 * - `required`, `id`, `aria-invalid`, `aria-describedby` and `aria-errormessage` go to the visible input.
 *
 * `disabled` and `readOnly` live in each primitive's state. ui-sdk's agent
 * bridge reads those two keys itself: the snapshot lists the control with
 * `disabled: true` and no actions, and a step on it is refused.
 */
export type BookiFormProps = {
  /** Field name in a native form. Submits the canonical value. */
  name?: string;
  /** Id of the visible input, for `<label htmlFor>`. */
  id?: string;
  disabled?: boolean;
  /** Shown and submitted, but nobody (person or agent) can change it. */
  readOnly?: boolean;
  required?: boolean;
  /** Goes to the visible input, so a screen reader announces the error on the field. */
  "aria-invalid"?: ComponentProps<"input">["aria-invalid"];
  /** Goes to the visible input: the id of the hint or error text. */
  "aria-describedby"?: string;
  /** Goes to the visible input: the id of the error message. */
  "aria-errormessage"?: string;
};

type FieldAria = Pick<BookiFormProps, "aria-invalid" | "aria-describedby" | "aria-errormessage">;

/**
 * Takes the three state attributes of a field out of the props that go to the
 * wrapper, so they can be spread on the visible input instead. Only the ones
 * given are returned: an absent one never overwrites what the part sets itself.
 */
export function splitFieldAria<T extends FieldAria>(props: T): { field: FieldAria; rest: Omit<T, keyof FieldAria> } {
  const {
    "aria-invalid": invalid,
    "aria-describedby": describedby,
    "aria-errormessage": errormessage,
    ...rest
  } = props;
  const field: FieldAria = {};
  if (invalid !== undefined) field["aria-invalid"] = invalid;
  if (describedby !== undefined) field["aria-describedby"] = describedby;
  if (errormessage !== undefined) field["aria-errormessage"] = errormessage;
  return { field, rest };
}

export {
  inputLockAttrs,
  isLocked,
  lockOptions,
  lockState,
  restoreSelect,
  selectLockAttrs,
  type LockOptions,
  type LockState,
} from "@booki-aui/primitives/lock";

/** The hidden input that carries a control's canonical value into a form. */
export function FormValue({ name, value, disabled }: { name?: string; value: string | number; disabled?: boolean }) {
  if (!name) return null;
  return <input type="hidden" name={name} value={String(value)} disabled={disabled} />;
}
