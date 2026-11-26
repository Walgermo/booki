---
"@booki-aui/core": patch
"@booki-aui/react": patch
---

History from `createBookiHistory` gains `undoEntry(id)`: it undoes one entry only while it is still the latest applied change, checked when its turn runs rather than when it is asked for. A receipt's Undo uses it, so a change a person makes while an agent turn holds the undo back is kept and the undo is refused. Refusals `history.later-changes` and `history.no-entry` are in the catalogue (en and nb).
