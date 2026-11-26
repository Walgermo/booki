---
"@booki-aui/core": patch
"@booki-aui/primitives": patch
"@booki-aui/react": patch
"@booki-aui/styles": patch
"@booki-aui/web": patch
"@booki-aui/vue": patch
"@booki-aui/svelte": patch
"@booki-aui/solid": patch
---

DocumentEditor, a block editor for working papers. "/" opens commands and "@" mentions the files, evidence, people and pages the app passes. An agent reads the page as blocks and can find, insert, edit, move and remove blocks or run a command by name; every one is a proposal, shown in the agent's colour, that waits until a person accepts or rejects it. Accept and Reject are a person's buttons, never agent actions, and an accept is refused when a person changed the block after the agent saw it. `onAudit` gets one row per change. The block model, the proposal rules and TipTap JSON converters are in `@booki-aui/core/document-blocks`.
