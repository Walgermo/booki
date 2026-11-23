---
"@booki/readiness": patch
---

Readiness: a `--timeout <ms>` option for page load (the CLI had a fixed 30 s, too short for a dev server compiling a page on first request); `check(page)` works in your own Playwright page without defining `globalThis.__name`, because every function sent to the page carries its own helper; and the field-name checks skip inputs no one can reach (`aria-hidden`, `inert`, `type="hidden"`, not rendered, or visually hidden out of the tab order, such as the native input Base UI and Radix put beside a custom select, radio group or checkbox), while a visible unlabelled input is still reported. The README shows how to check a form behind a button from your own script.
