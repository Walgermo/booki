/**
 * The `disabled` / `readOnly` lock every form control shares.
 *
 * `disabled` and `readOnly` live in each primitive's state. ui-sdk's agent
 * bridge reads those two keys itself: the snapshot lists the control with
 * `disabled: true` and no actions, and a step on it is refused.
 */

/** Option kinds every lockable primitive declares. */
export const lockOptions = { disabled: "boolean", readOnly: "boolean" } as const;

export type LockOptions = { disabled?: boolean; readOnly?: boolean };
export type LockState = { disabled: boolean; readOnly: boolean };

/** `disabled` / `readOnly` follow the options exactly; absent means false. */
export function lockState(options: LockOptions): LockState {
  return {
    disabled: options.disabled === true,
    readOnly: options.readOnly === true,
  };
}

/** A person's input is ignored while this is true. */
export function isLocked(state: LockState): boolean {
  return state.disabled || state.readOnly;
}

/**
 * Attributes for a visible `<input>`. Slot attributes are HTML attributes, so
 * a boolean one is present as "" and absent as undefined.
 */
export function inputLockAttrs(state: LockState) {
  return {
    disabled: state.disabled ? "" : undefined,
    readonly: state.readOnly ? "" : undefined,
  };
}

/**
 * Attributes for a visible `<select>`. HTML has no read-only select, so it
 * stays focusable, says so to assistive tech, and its change handler puts the
 * value back (see `restoreSelect`).
 */
export function selectLockAttrs(state: LockState) {
  return {
    disabled: state.disabled ? "" : undefined,
    "aria-readonly": state.readOnly ? "true" : undefined,
    "data-readonly": state.readOnly ? "" : undefined,
  };
}

/** Undo what a person picked in a locked select. */
export function restoreSelect(event: Event, value: string): void {
  const el = event.target as HTMLSelectElement | null;
  if (el && el.value !== value) el.value = value;
}
