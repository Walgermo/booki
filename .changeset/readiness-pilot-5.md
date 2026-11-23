---
"@booki/readiness": patch
---

Two fixes from the fifth product pilot.

- **New check, "Field missing from the bridge" (`field-not-on-bridge`, 5 points each, at most 30).** A page with a bridge scored 100 although a radio group and four filter selects a person could use had no entry in the bridge's snapshot. On a page whose bridge has a snapshot, every named field a person can use must now be covered: its name equals an entry's `label`, or it sits inside the element of a bridge component (ui-sdk's `data-slot="<component>"` root, or its `<component>-<part>` parts). A radio group is reported once; disabled fields, fields inside `data-agent-hidden` and hidden inputs are skipped.
- **WebMCP tools are listed once.** A tool registered again (ui-sdk's `registerTools` under React's development double effect unregisters by aborting its signal, then registers again) or on both `document` and `navigator` was listed twice. Registrations now honour the `signal`, replace a tool of the same name, and `provideContext` replaces the tool set.
