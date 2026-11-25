/**
 * Form participation shared by the composed Booki controls.
 *
 * - `name`: the control submits with a native `<form>` through a hidden input
 *   carrying its canonical value (minor units, digits, ISO date, code).
 * - `disabled`: not editable and not submitted, as in HTML.
 * - `readOnly`: shown and submitted, not editable.
 * - `required` and `id` go to the visible input.
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
};

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
