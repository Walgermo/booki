# @booki-aui/icons

Booki's icons for accounting UI: duotone line icons on a 24 grid with a 1.5
stroke, drawn for 16 and 20 px. They draw in `currentColor`, so they take the
colour of the text beside them, in the light and the dark theme alike.

```tsx
import { Icon } from "@booki-aui/icons/react"

<Icon name="banknote" />            // decorative: aria-hidden
<Icon name="bank" size={20} aria-label="Bank account" role="img" />
```

Without React:

```ts
import { iconSvg, iconNames } from "@booki-aui/icons"

element.innerHTML = iconSvg("document-lines", 16)
```

The plain files are in `@booki-aui/icons/svg/<name>.svg`.

## Changing or adding an icon

The sources are in `source/` (geometry only) and the style is set once in
`icons.yaml` at the repository root. Draw with the
[draw-icons](https://github.com/ronykax/skills) skill, then:

```bash
node <draw-icons>/scripts/icons.js build
pnpm --filter @booki-aui/icons generate
```

`build` writes the SVG files next to `package.json` and `generate` writes `lib/`; both are committed.
