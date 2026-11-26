# @booki-aui/web

Experimental. This package is less tested than `@booki-aui/react`, and its API may
change between releases. See the
[Support section](https://github.com/Walgermo/booki#support) of the README.

Agent-first accounting controls as custom elements: the same rules, state and
agent actions as `@booki-aui/react`, for any framework or none. Use it in Angular,
in pages rendered on the server, or in plain HTML.

```bash
pnpm add @booki-aui/web @booki-aui/styles @ui-sdk/core@0.1.0-beta.18 @ui-sdk/web@0.1.0-beta.18
```

```html
<script type="module">
  import "@booki-aui/web/amount-field"
  import { createBookiAgent, registerTools } from "@booki-aui/web"

  const allow = (step) => !step.confirm // marked steps (post, pay) go to a person
  const agent = createBookiAgent({ agentId: "bookkeeper", allow })
  registerTools(agent, { allow })
</script>

<booki-amount-field aria-label="Beløp" currency="NOK" locale="nb-NO">
  <booki-amount-field-currency>NOK</booki-amount-field-currency>
  <booki-amount-field-input><input /></booki-amount-field-input>
</booki-amount-field>
```

`agent.snapshot()` now lists the field with its actions (`setMinor`, `clear`),
and `agent.act` sets it in integer minor units, refusing decimals and text the
same way the React control does. Changes fire events on the root, such as
`valuechange`; rich options (a chart of accounts, voucher lines) are
properties: `element.accounts = [...]`.

## Angular

Custom elements need one schema entry:

```ts
import { CUSTOM_ELEMENTS_SCHEMA, Component } from "@angular/core"
import "@booki-aui/web/amount-field"

@Component({
  selector: "app-voucher",
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <booki-amount-field aria-label="Beløp" currency="NOK" (valuechange)="amount = $event.detail.value">
      <booki-amount-field-input><input /></booki-amount-field-input>
    </booki-amount-field>
  `,
})
export class VoucherComponent {
  amount = 0
}
```

## The agent's cursor

```html
<booki-agent-cursor label="Agent"></booki-agent-cursor>
<script type="module">
  import { createAgentCursor, createBookiAgent } from "@booki-aui/web"
  const cursor = createAgentCursor()
  const agent = createBookiAgent({ allow: cursor.wrap(allow) })
  document.querySelector("booki-agent-cursor").cursor = cursor
</script>
```

Before each step the pointer goes to the control and presses, then your
`allow` decides; `@booki-aui/styles` draws it. Set `element.narrate = (state) =>
"…"` to say the step in your language. It works the same from Vue, Svelte or
Solid.

## Tags

Every control is `booki-<control>` with one tag per part, such as
`booki-voucher-composer-debit`. Parts that are fields or buttons wrap a native
`<input>`, `<select>` or `<button>` you write inside them. `entries.json` lists
the controls; each has its own entry, so a page loads only what it uses.

Peer dependencies: `@ui-sdk/core` and `@ui-sdk/web` 0.1.0-beta.18.
