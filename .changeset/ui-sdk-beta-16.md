---
"@booki/primitives": patch
"@booki/react": patch
"@booki/web": patch
"@booki/vue": patch
"@booki/svelte": patch
"@booki/solid": patch
---

Built on `@ui-sdk/*` 0.1.0-beta.16 (was beta.14), and the peer dependencies ask for it exactly, so move your `@ui-sdk` packages with Booki. The release only fixes behaviour: Escape closes an open layer such as a tooltip before a page shortcut runs, a hover-opened submenu closes first on Escape, an OTP field reads digits from other scripts, a dialog keeps focus when Safari's Tab skips its buttons, and placed content keeps its arrow keys when items arrive late. No Booki API changes. beta.16 was published on 2026-11-23; under a release-age rule (pnpm 11 waits one day by default) it installs from 2026-11-24.
