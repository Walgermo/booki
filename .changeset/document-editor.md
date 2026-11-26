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

DocumentEditor, a block editor for working papers. "/" opens commands and "@" mentions the files, evidence, people and pages the app passes. An agent reads the page as blocks and can find, insert, edit, move and remove blocks or run a command by name; every one is a proposal, shown in the agent's colour, that waits until a person accepts or rejects it. Accept and Reject are a person's buttons, never agent actions, and an accept is refused when a person changed the block after the agent saw it. `onAudit` gets one row per change. The block model, the proposal rules and TipTap JSON converters are in `@booki-aui/core/document-blocks`. `proposals` / `onProposalsChange` let the app store waiting proposals so they outlive the page. `fromHtml` / `toHtml` read and write an editor's HTML: the block-id attribute is an option (default `data-block-id`), every other attribute is kept, bold, italics, code and links become inline markdown and come back as markup, and anything the editor cannot edit (a table, a data field) is carried through untouched as an `embed`. A block an accepted proposal wrote keeps the agent's `origin` until a person edits it.
