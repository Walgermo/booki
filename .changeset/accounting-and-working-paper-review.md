---
"@booki-aui/core": minor
"@booki-aui/primitives": patch
"@booki-aui/react": patch
"@booki-aui/readiness": minor
---

Preserve fractional basis points when calculating invoice and voucher tax. Payment batch approval and release now require a real calendar date. Aging reports calculate totals exactly and refuse totals outside the safe minor-unit range.

New working-paper proposals receive opaque, durable IDs. Read the ID from the proposal or bridge result when accepting, rejecting or withdrawing it. Existing pending proposals keep their IDs. HTML-backed papers preserve callout editability and list item identities. The editor exposes its suggestions as a listbox attached to the text area.

Conformance checks on an empty bridge now report an incomplete result and return `conforms: false`. Run the check after the screen mounts.
