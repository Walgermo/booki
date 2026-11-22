/**
 * The person's side of Booki's closed pickers (AccountPicker, TaxCodeSelect,
 * CurrencySelect, AccountingPeriodSelect), composed from ui-sdk behaviours the
 * way ui-sdk's own Select and Combobox are:
 *
 * - `createListbox` keeps one option highlighted and moves it with the arrow
 *   keys and PageUp/PageDown. Focus stays on the trigger (or the search
 *   input), which points `aria-activedescendant` at the highlighted option,
 *   as the WAI-ARIA select-only and editable combobox patterns ask. Its
 *   `query` filters the options for AccountPicker's long chart of accounts.
 * - `createSelection` chooses the option, through the control's own change,
 *   so `onValueChange`, a controlled `value` and the audit trail see a
 *   person's pick with its DOM event.
 * - `createTypeahead` finds an option as someone types its name, on the open
 *   list and on the closed trigger, like a native select.
 *
 * - `createPointerKind` tells a finger from a mouse. On a touch screen the
 *   three short pickers show their native `<select>` part instead, the
 *   platform's own picker; the trigger shows everywhere else. AccountPicker
 *   keeps its search on a phone too: a wheel of a whole chart is no picker.
 *   Both drive the same api, so the agent contract never sees which one a
 *   person used. The server and the first render assume a mouse.
 *
 * Nothing here is an agent action: agents keep calling setAccount,
 * setTaxCode, setCurrency or setPeriod.
 */
import {
  createListbox,
  createPointerKind,
  createSelection,
  createTypeahead,
  elements,
  isTypeaheadKey,
  labelOf,
  selects,
  type PointerKindState,
  type PrimitiveContext,
  type SlotFactory,
} from "@ui-sdk/core";
import { isLocked, type LockState } from "./lock.js";

/** What every picker keeps in state beside its value. None of it is in the snapshot. */
export type PickerOwnState = {
  /** Whether the list is open. */
  open: boolean;
  /** The highlighted option's key, while the list is open. */
  highlighted: string | null;
  /** `[value]`, as `createSelection` reads a selection. */
  selected: string[];
  /** What the person typed into a searchable picker's input. */
  query: string;
  /** The device's pointer, from `createPointerKind`: a finger gets the native picker. */
  pointer: PointerKindState;
};

export type PickerState = LockState & PickerOwnState & { value: string; label: string };

/** The starting picker state for a value. */
export function pickerState(value: string): PickerOwnState {
  return {
    open: false,
    highlighted: null,
    selected: value ? [value] : [],
    query: "",
    pointer: { pointer: "unknown", hover: "unknown", anyPointer: "unknown", anyHover: "unknown" },
  };
}

/** Whether a person on this device uses the native `<select>` instead of the trigger and list. */
export function usesNative(state: PickerOwnState): boolean {
  return state.pointer.pointer === "coarse";
}

/** Attributes for the native `<select>` fallback: hidden unless it is the picker a finger uses. */
export function fallbackAttrs(state: PickerOwnState, search = false) {
  return { hidden: !search && usesNative(state) ? undefined : "" };
}

type Why = { reason: string; event?: Event };

export type PickerConfig<State> = {
  /** Writes the chosen key through the control's own change. Returns whether it went through. */
  commit: (key: string, why: Why) => boolean;
  /** What the closed trigger or input shows for the current value. */
  text: (state: State) => string;
  /** Filter the options by what the person types (AccountPicker). */
  search?: boolean;
};

type OptionProps = { value?: string; label?: string; disabled?: boolean };

export function createPicker<State extends PickerState>(
  context: PrimitiveContext<any, State, any>,
  config: PickerConfig<State>,
) {
  const { store } = context;
  const search = config.search === true;

  const listbox = createListbox<State>(context, {
    key: "highlighted",
    focus: "virtual",
    ...(search ? { query: () => store.get().query } : {}),
    onHighlight: (key) => {
      if (key === null) return;
      const el = context.element("option", key);
      el?.scrollIntoView?.({ block: "nearest" });
    },
  });

  const options = () => elements<OptionProps>(context, "option").filter((o) => !o.props.disabled);

  const selection = createSelection<unknown, State, "selected", string>(context, {
    key: "selected",
    set: (keys, why) => {
      const key = keys[0];
      return key === undefined ? false : config.commit(key, why);
    },
    order: () => options().map((o) => o.key),
    selectable: (key) => !context.props<OptionProps>("option", key)?.disabled,
  });

  const typeahead = createTypeahead();

  // `selected` mirrors `value` whoever changed it: a person, an agent, or the owner.
  const mirror = () => {
    const { value, selected } = store.get();
    if (selected.length === (value ? 1 : 0) && (selected[0] ?? "") === value) return;
    store.set({ selected: value ? [value] : [] } as Partial<State>);
  };
  context.onDestroy(store.subscribe(mirror));

  const focusTrigger = () => {
    const el = context.element(search ? "input" : "trigger");
    if (el && el.ownerDocument.activeElement !== el) el.focus();
  };

  function open(at: "selected" | "first" | "last", event?: Event) {
    const state = store.get();
    if (isLocked(state)) return;
    if (!state.open) store.set({ open: true } as Partial<State>);
    if (at === "selected" && state.value && !state.query) listbox.highlight(state.value, { event });
    else listbox.move(at === "last" ? "last" : "first", event);
  }

  function close() {
    typeahead.reset();
    const partial: Partial<PickerOwnState> = {};
    const state = store.get();
    if (state.open) partial.open = false;
    if (state.highlighted !== null) partial.highlighted = null;
    if (state.query) partial.query = "";
    if (Object.keys(partial).length) store.set(partial as Partial<State>);
  }

  /** Chooses an option for the person, closes the list and keeps focus on the trigger. */
  function choose(key: string, event?: Event) {
    if (isLocked(store.get())) return;
    selection.choose(key, { reason: "item-press", event });
    close();
    focusTrigger();
  }

  /** Typing a name: highlights the match on the open list, or chooses it on the closed trigger. */
  function find(event: KeyboardEvent): boolean {
    if (!isTypeaheadKey(event)) return false;
    if (event.key === " " && !typeahead.active()) return false;
    const state = store.get();
    const list = options();
    const current = state.open ? state.highlighted : state.value;
    const index = typeahead(
      event.key,
      list.map((o) => o.props.label ?? labelOf(o.el)),
      list.findIndex((o) => o.key === current),
    );
    event.preventDefault();
    const found = list[index];
    if (!found) return true;
    if (state.open) listbox.highlight(found.key, { event });
    else selection.choose(found.key, { reason: "typeahead", event });
    return true;
  }

  /** The select-only trigger's keys: the WAI-ARIA select-only combobox pattern. */
  function triggerKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented) return;
    const state = store.get();
    if (isLocked(state)) return;
    if (!state.open) {
      if (["ArrowDown", "ArrowUp", "Enter"].includes(event.key) || (event.key === " " && !typeahead.active())) {
        event.preventDefault();
        open("selected", event);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        open(event.key === "Home" ? "first" : "last", event);
      } else {
        find(event);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (
      event.key === "Enter" ||
      (event.key === " " && !typeahead.active()) ||
      (event.key === "ArrowUp" && event.altKey)
    ) {
      event.preventDefault();
      const key = store.get().highlighted;
      if (key) choose(key, event);
      else close();
    } else if (event.key === "Tab") {
      close();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      listbox.move(event.key === "Home" ? "first" : "last", event);
    } else if (listbox.keydown(event) === undefined) {
      find(event);
    }
  }

  /** A searchable picker's input: the WAI-ARIA editable combobox pattern with list autocomplete. */
  function inputKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || (event as KeyboardEvent & { isComposing?: boolean }).isComposing) return;
    const state = store.get();
    if (isLocked(state)) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!state.open) open(event.key === "ArrowUp" && !event.altKey ? "last" : "selected", event);
      else if (event.altKey && event.key === "ArrowUp") close();
      else listbox.keydown(event);
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      if (!state.open) return;
      listbox.keydown(event);
    } else if (event.key === "Enter") {
      if (!state.open) return;
      event.preventDefault();
      const key = state.highlighted;
      if (key) choose(key, event);
      else close();
    } else if (event.key === "Escape") {
      if (!state.open && !state.query) return;
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      close();
    }
  }

  /** What the person typed into the search input. */
  function input(text: string, event?: Event) {
    if (isLocked(store.get())) return;
    store.set({ query: text, open: true } as Partial<State>);
    listbox.move("first", event);
  }

  /** The trigger or input lost focus to something outside the picker. */
  function blur() {
    close();
  }

  /** A press on the trigger opens or closes the list. */
  function toggle(event?: Event) {
    if (store.get().open) close();
    else open("selected", event);
  }

  /** Follows the device's pointer from a part's `bind`, so a finger gets the native picker. */
  function followPointer() {
    return createPointerKind().follow(store as never, "pointer");
  }

  return {
    listbox,
    selection,
    typeahead,
    open,
    close,
    choose,
    toggle,
    triggerKeydown,
    inputKeydown,
    input,
    blur,
    followPointer,
    text: config.text,
    search,
  };
}

export type Picker<State extends PickerState = PickerState> = ReturnType<typeof createPicker<State>>;

const listId = (id: string) => `${id}-list`;
const TRIGGER_KEYS = [
  "ArrowDown",
  "ArrowUp",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Enter",
  " ",
  "Escape",
  "Tab",
  "typeahead",
] as const;

/** The select-only trigger: a `<button>` with the combobox role, named by the picker's label. */
export function pickerTrigger<State extends PickerState, Api extends { picker: Picker<State> }>(
  slot: SlotFactory<State, Api>,
) {
  return slot<{}, { open: boolean; value: string; text: string }>({
    role: "combobox",
    focus: "native",
    keys: [...TRIGGER_KEYS],
    state: (state, part) => ({ open: state.open, value: state.value, text: part.api.picker.text(state) }),
    attrs: (state, part) => ({
      type: "button",
      value: state.value,
      "aria-label": state.label,
      "aria-expanded": String(state.open),
      "aria-haspopup": "listbox",
      "aria-controls": listId(part.id),
      "aria-activedescendant": state.open ? part.api.picker.listbox.activeId(state) : undefined,
      "aria-readonly": state.readOnly ? "true" : undefined,
      disabled: state.disabled ? "" : undefined,
      "data-open": state.open ? "" : undefined,
      "data-readonly": state.readOnly ? "" : undefined,
      // On a touch screen the native <select> part is the picker.
      hidden: usesNative(state) ? "" : undefined,
    }),
    press: ({ api }, event) => api.picker.toggle(event),
    bind: (_el, part) => part.api.picker.followPointer(),
    on: {
      keydown: (event, { api }) => api.picker.triggerKeydown(event as KeyboardEvent),
      // Space activates a button on keyup; the list already handled it on keydown.
      keyup: (event) => {
        if ((event as KeyboardEvent).key === " ") event.preventDefault();
      },
      blur: (_event, { api }) => api.picker.blur(),
    },
  });
}

/** A searchable picker's input: an editable combobox that filters the list as someone types. */
export function pickerInput<State extends PickerState, Api extends { picker: Picker<State> }>(
  slot: SlotFactory<State, Api>,
) {
  return slot<{}, { open: boolean; value: string; text: string; query: string }>({
    role: "combobox",
    focus: "native",
    keys: ["ArrowDown", "ArrowUp", "PageUp", "PageDown", "Enter", "Escape", "Tab"],
    state: (state, part) => ({
      open: state.open,
      value: state.value,
      text: part.api.picker.text(state),
      query: state.query,
    }),
    attrs: (state, part) => ({
      type: "text",
      autocomplete: "off",
      spellcheck: "false",
      value: state.open || state.query ? state.query : part.api.picker.text(state),
      placeholder: part.api.picker.text(state),
      "aria-label": state.label,
      "aria-autocomplete": "list",
      "aria-expanded": String(state.open),
      "aria-controls": listId(part.id),
      "aria-activedescendant": state.open ? part.api.picker.listbox.activeId(state) : undefined,
      disabled: state.disabled ? "" : undefined,
      readonly: state.readOnly ? "" : undefined,
      "data-open": state.open ? "" : undefined,
    }),
    on: {
      keydown: (event, { api }) => api.picker.inputKeydown(event as KeyboardEvent),
      input: (event, { api }) => api.picker.input((event.target as HTMLInputElement).value, event),
      // The chosen account is selected on focus, so typing starts a new search.
      focus: (event) => (event.target as HTMLInputElement).select?.(),
      click: (event, { api, store }) => {
        if (!store.get().open) api.picker.open("selected", event);
      },
      blur: (_event, { api }) => api.picker.blur(),
    },
  });
}

/** The list of options. Hidden while closed, so typeahead on the closed trigger still finds them. */
export function pickerList<State extends PickerState, Api extends { picker: Picker<State> }>(
  slot: SlotFactory<State, Api>,
) {
  return slot<{}, { open: boolean }>({
    role: "listbox",
    keys: { none: "The trigger or input keeps focus and handles them." },
    state: (state) => ({ open: state.open }),
    attrs: (state, part) => ({
      id: listId(part.id),
      "aria-label": state.label,
      hidden: state.open ? undefined : "",
      "data-open": state.open ? "" : undefined,
    }),
    on: {
      // Focus stays on the trigger while the person presses into the list or its scrollbar.
      pointerdown: (event) => event.preventDefault(),
    },
  });
}

/** One option. Its `value` is its key; `label` is what typeahead and the filter match. */
export function pickerOption<State extends PickerState, Api extends { picker: Picker<State> }>(
  slot: SlotFactory<State, Api>,
) {
  return slot<{ value: string; label?: string; disabled?: boolean }, { selected: boolean; highlighted: boolean }>({
    role: "option",
    focus: "active-descendant",
    props: { value: "string", label: "string", disabled: "boolean" },
    selects: selects<State, Api, { value: string; label?: string; disabled?: boolean }>({
      highlighted: ({ key }: { key: string }) => [key, null],
    } as never),
    present: (_state, part) => !part.api.picker.search || part.api.picker.listbox.shows(part),
    state: (state, part) => ({ selected: state.value === part.key, highlighted: state.highlighted === part.key }),
    attrs: (state, part) => ({
      ...part.api.picker.listbox.attrs(state, part),
      "aria-selected": String(state.value === part.key),
      "data-selected": state.value === part.key ? "" : undefined,
    }),
    press: ({ api, key }, event) => api.picker.choose(key, event),
    on: {
      pointerdown: (event) => event.preventDefault(),
      pointermove: (event, { api, key }) => api.picker.listbox.highlight(key, { event }),
    },
    bind: (el, part) => part.api.picker.listbox.bind(el, part),
  });
}

/** Shown in a searchable picker's open list when nothing matches what was typed. */
export function pickerEmpty<State extends PickerState, Api extends { picker: Picker<State> }>(
  slot: SlotFactory<State, Api>,
) {
  return slot({
    role: "status",
    present: (state, part) => state.open && part.api.picker.search && part.api.picker.listbox.count() === 0,
  });
}
