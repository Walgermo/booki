# @booki-aui/icons

Booki's icons for accounting UI: duotone line icons on a 24 grid with a 1.5
stroke, drawn for 16 and 20 px. They draw in `currentColor`, so they take the
colour of the text beside them, in the light and the dark theme alike.

Browse and search them, and copy an import, at [booki.dev/docs/icons](https://booki.dev/docs/icons).

## Customer due diligence

Use `shield` for the AML/KYC overview, `risk-matrix` for the risk assessment, and
`fingerprint` for identity verification. Find specific icons for ownership,
political exposure, declarations, evidence reuse, AML reports, monitoring and
sanctions in the [coverage catalog](./COVERAGE.md).

## React

Import the icons you use by name; a bundler brings in only those.

```tsx
import { BanknoteIcon, BankIcon } from "@booki-aui/icons/react"

<BanknoteIcon />                                         // 16 px, decorative (aria-hidden)
<BankIcon size={20} aria-label="Bank account" role="img" /> // when the icon alone names a control
```

`<Icon name="banknote" />` takes the name as data (from a config or an API), but brings every
icon into the bundle. Names are typed (`IconName`), so a wrong one fails the typecheck.

## Any framework

```ts
import { iconSvg, iconNames } from "@booki-aui/icons"

element.innerHTML = iconSvg("banknote")     // a complete <svg>, 16 px
element.innerHTML = iconSvg("banknote", 20)
```

`iconSvg` throws on an unknown name and lists the names. The plain files are at
`@booki-aui/icons/svg/<name>.svg`.

## Changing or adding an icon

The sources are in `source/` (geometry only, one SVG per icon; shared shapes in
`source/parts/`). The style is set once in `icons.yaml` at the repository root.
Draw with the [draw-icons](https://github.com/ronykax/skills) skill
(`npx skills add ronykax/skills --skill draw-icons`), then from the repository root:

```bash
pnpm icons
```

That builds the SVG files and writes `lib/`; commit both. `pnpm test` fails if `lib/` is out
of date with the drawings.
