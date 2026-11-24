# @booki/readiness

## 0.1.1

### Patch Changes

- [#40](https://github.com/Walgermo/booki/pull/40) [`53b7062`](https://github.com/Walgermo/booki/commit/53b706222393d8c430774de75d4cea57ab36f0ed) Thanks [@Walgermo](https://github.com/Walgermo)! - The Agent Contract is now marked a draft with one implementation.
  
  - **`@booki/readiness/conformance`**: `runConformance` runs 12 checks of the contract (sections 2 to 7) against any bridge with `snapshot`, `act` and `subscribe`, and `formatConformance` prints them.
  - **`@booki/readiness/reference`**: `createReference`, a small implementation of the contract without Booki or ui-sdk.

- [#53](https://github.com/Walgermo/booki/pull/53) [`b49118e`](https://github.com/Walgermo/booki/commit/b49118e1fc672177c63dd53ab9b839fe4da2c5ee) Thanks [@Walgermo](https://github.com/Walgermo)! - Readiness: a `--timeout <ms>` option for page load (the CLI had a fixed 30 s, too short for a dev server compiling a page on first request); `check(page)` works in your own Playwright page without defining `globalThis.__name`, because every function sent to the page carries its own helper; and the field-name checks skip inputs no one can reach (`aria-hidden`, `inert`, `type="hidden"`, not rendered, or visually hidden out of the tab order, such as the native input Base UI and Radix put beside a custom select, radio group or checkbox), while a visible unlabelled input is still reported. The README shows how to check a form behind a button from your own script.

- [`a83c50c`](https://github.com/Walgermo/booki/commit/a83c50ce8342c3d96505c165eddab174a2aa3230) Thanks [@Walgermo](https://github.com/Walgermo)! - Two fixes from the fifth product pilot.
  
  - **New check, "Field missing from the bridge" (`field-not-on-bridge`, 5 points each, at most 30).** A page with a bridge scored 100 although a radio group and four filter selects a person could use had no entry in the bridge's snapshot. On a page whose bridge has a snapshot, every named field a person can use must now be covered: its name equals an entry's `label`, or it sits inside the element of a bridge component (ui-sdk's `data-slot="<component>"` root, or its `<component>-<part>` parts). A radio group is reported once; disabled fields, fields inside `data-agent-hidden` and hidden inputs are skipped.
  - **WebMCP tools are listed once.** A tool registered again (ui-sdk's `registerTools` under React's development double effect unregisters by aborting its signal, then registers again) or on both `document` and `navigator` was listed twice. Registrations now honour the `signal`, replace a tool of the same name, and `provideContext` replaces the tool set.

## 0.1.0

First preview. Not yet on npm: Booki is published once v1 has run in a real product.
