# A control of your own, operated by an agent

A select, input or button your product already has can stay as it is. Give it
a primitive (its state, its named actions, its rules) and put the control
inside the primitive's root. The code below is tested in
`packages/react/src/own-control.test.tsx`.

```tsx
"use client"

import { createChange, definePrimitive, usePart, usePrimitive } from "@booki-aui/react"

type Option = { value: string; label: string }
type CostCentreOptions = {
  options: Option[]
  value: string
  onValueChange?: (value: string, details: { source?: string }) => void
}

const costCentre = definePrimitive({
  name: "cost-centre",
  options: { options: "value", value: "string", onValueChange: "callback" },
  controlled: ["value"],
  state: (options: CostCentreOptions) => ({ value: options.value, options: options.options }),
  sync: (options: CostCentreOptions) => ({ value: options.value, options: options.options }),
  api: (context) => {
    const change = createChange(context)
    return {
      setCostCentre: (value: string): boolean => {
        const { options } = context.store.get()
        if (!options.some((option) => option.value === value)) {
          throw new Error(`No cost centre "${value}". Use one of: ${options.map((o) => o.value).join(", ")}.`)
        }
        return change("value", value, { reason: "set-cost-centre" })
      },
      items: () => context.store.get().options,
    }
  },
  slots: (slot) => ({ root: slot({ role: "group", attrs: () => ({ "data-slot": "cost-centre" }) }) }),
  agent: { actions: ["setCostCentre"], items: (api) => api.items() },
})

// The select the product already has: it gives a value, not a DOM event.
function YourSelect(props: { options: Option[]; value: string; onValueChange: (value: string) => void }) {
  return (
    <select aria-label="Kostnadssted" value={props.value} onChange={(e) => props.onValueChange(e.target.value)}>
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function CostCentre(props: CostCentreOptions) {
  const handle = usePrimitive(costCentre, props)
  return usePart(
    handle,
    "root",
    {},
    {
      "aria-label": "Kostnadssted",
      children: (
        <YourSelect
          options={props.options}
          value={props.value}
          onValueChange={(value) => handle.api.setCostCentre(value)}
        />
      ),
    },
    "div",
  )
}
```

What each piece does:

- **`agent.actions`** is everything the agent can call, by name. Leave out what
  only a person may do.
- **A refusal is a sentence the agent can act on**: what was wrong and what
  exists. With a long list, name the nearest few and the count.
- **`controlled`** is what the snapshot shows. Keep it short. `agent.items` is
  what `query({ within })` searches; it does not have to be in the snapshot.
- **`handle.api.setCostCentre(value)`** from your control's own callback is a
  person's change. The agent's goes through the same function. `details.source`
  is `"agent"` for the agent's only, so `onValueChange` knows whose it was.
- **Where you have the DOM event, pass it** (`change("value", value, { reason, event })`):
  the source is then the mouse, touch or keyboard it came from.
- **Parts inside**: mark each with its slot (`usePart(costCentre, "name", {}, props, "span")`).
  A slot's name is lower case, one word, and `press` is not one: it is the
  bridge's own action for buttons.
- **An irreversible button** carries `data-agent-confirm="Post the voucher"`. If
  only a person may ever press it, wrap the sentence:
  `data-agent-confirm={personOnly("Release payments")}`, and no `allow` can let
  an agent through.
- Vue, Svelte, Solid and custom elements: the same `definePrimitive`, rendered
  with `createParts` from `@ui-sdk/<framework>/primitive`.

Check it: `agent.snapshot()` lists the control with its label, value and
actions; `agent.act({ steps: [{ ref, action: "setCostCentre", args: ["200"] }] })`
changes it; a value that does not exist is refused with the ones that do.

## The lower threshold: useBookiField

For an amount, a closed list of codes or an ISO date, a product does not need
`definePrimitive`. Wrap the field it already has in `useBookiField`: the hook
keeps the value, adds the agent's action and its rules, and the product's own
field is what `render` returns.

```tsx
useBookiField({ kind, value, onValueChange, label, ... }, ({ value, change, refusal }) => <YourField ... />)
```

The code below is tested in `packages/react/src/use-booki-field.test.tsx`. Keep
the two in sync.

```tsx
"use client"

import { useBookiField } from "@booki-aui/react"
import { useState } from "react"

const drift = [
  { value: "100", label: "Drift" },
  { value: "200", label: "Prosjekt" },
]

// An amount is integer minor units: 12500 is 125.00 NOK. This field takes øre as typed; for a field
// where the person types kroner ("125,00"), keep the text as a draft and parse it with parseToMinor,
// as the install skill's useBookiField example does.
function AmountField(props: {
  value: number
  onValueChange?: (minor: number, details: { source?: string }) => void
  disabled?: boolean
}) {
  return useBookiField(
    {
      kind: "amount",
      value: props.value,
      currency: "NOK",
      label: "Beløp",
      onValueChange: props.onValueChange,
      disabled: props.disabled,
    },
    ({ value, change, refusal }) => (
      <div>
        <input aria-label="Beløp-felt" value={value} onChange={(e) => change(Number(e.target.value), e.nativeEvent)} />
        {refusal ? <p role="alert">{refusal}</p> : null}
      </div>
    ),
  )
}

// A code is one of a closed list. The select gives a value and its DOM event.
function CostCentreField(props: {
  value: string
  onValueChange?: (code: string, details: { source?: string }) => void
}) {
  return useBookiField(
    { kind: "code", value: props.value, options: drift, label: "Kostnadssted", onValueChange: props.onValueChange },
    ({ value, change, refusal }) => (
      <div>
        <select aria-label="Kostnadssted-velger" value={value} onChange={(e) => change(e.target.value, e.nativeEvent)}>
          {drift.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {refusal ? <p role="alert">{refusal}</p> : null}
      </div>
    ),
  )
}

// Values only a person may choose: `personOnly: ["won", "lost"]` refuses an agent's setCode to
// a deal's won or lost stage, and lets a person's change (with its DOM event) through.

// The product owns the value: it passes the new one back, as a real select does.
function CostCentreOwned(props: { onValueChange?: (code: string, details: { source?: string }) => void }) {
  const [code, setCode] = useState("100")
  return (
    <CostCentreField
      value={code}
      onValueChange={(next, details) => {
        setCode(next)
        props.onValueChange?.(next, details)
      }}
    />
  )
}

// A date is ISO YYYY-MM-DD, or "" for none.
function DateField(props: { value: string; onValueChange?: (date: string, details: { source?: string }) => void }) {
  return useBookiField(
    { kind: "date", value: props.value, label: "Forfallsdato", onValueChange: props.onValueChange },
    ({ value, change, refusal }) => (
      <div>
        <input aria-label="Dato-felt" value={value} onChange={(e) => change(e.target.value, e.nativeEvent)} />
        {refusal ? <p role="alert">{refusal}</p> : null}
      </div>
    ),
  )
}
```

What each piece does:

- **The agent's actions** are `setMinor` (amount), `setCode` (code) and `setDate`
  (date). Each one is the same rule a person meets, so a refused value comes back
  as `ok: false` with the sentence that says why: the unit, or the options that
  exist.
- **The product keeps owning the value.** `value` is what the field shows; the
  hook does not hold a copy the product must read from. `CostCentreOwned` passes
  the new value back, which is what a controlled select does.
- **`onValueChange` hears every change.** `details.source` is `"agent"` for the
  agent's changes and not for a person's, so the product can tell whose it was.
- **`change(next, event?)` is the person's path.** It returns `false` and sets
  `refusal` when the value is not allowed, instead of throwing. Show `refusal`
  next to the field. Pass the DOM event as the second argument where you have
  it, so the source is the mouse, touch or keyboard it came from.
- **`disabled` and `readOnly` leave the agent no actions.** The snapshot entry
  is still there, with its value, and offers nothing to call.
- **Other kinds need `definePrimitive`.** For anything beyond these three, use
  the primitive above in this document.
