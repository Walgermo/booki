---
"@booki/core": patch
"@booki/react": patch
---

Norwegian for the bridge and the cursor's amounts.

- **`createBookiAgent({ language: "nb" })`** now also translates the agent bridge's own sentences: a missing component ("Ingen komponent … på siden. Merkelappene på siden: …"), a step that needs a person, the person saying no, a cancelled or unanswered step, a missing or disabled button, an unknown item, and a step without a ref or an action. Before, only Booki's own refusals were Norwegian, and the model and the audit row got these in English. The sentences are in `@booki/core/messages` under `bridge.*`.
- **`narrateNorwegian`** shows an amount as a person writes it: "setter beløp 1 250,00", not "setter beløp 125000".
