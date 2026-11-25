# @booki-aui/styles

The optional default look for Booki: "Paper and Ink": paper for people, ink for what the machine reads, and one signal colour for agent activity, as CSS variables, styled through `data-slot` selectors.

```ts
import "@booki-aui/styles"
```

Override any `--bk-*` token on a wrapper to restyle. Dark theme: `data-bk-theme="dark"` on any element.

## Browsers

The stylesheets use native CSS nesting, `:where()`, `:has()`, `oklch()` and `color-mix()`. They need Chrome or Edge 112, Safari 16.5 or Firefox 117, or newer (all from 2023). An older browser drops the nested base rules, so the controls lose their default look but keep working. The controls themselves, and `@booki-aui/react` without these styles, have no such floor.

Docs and source: https://github.com/Walgermo/booki
