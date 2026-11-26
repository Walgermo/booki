---
"@booki-aui/core": patch
"@booki-aui/primitives": patch
---

`timeline` and `lastTouch` take an optional `{ dayStart: "local" }`: an entry dated with no time then starts at the beginning of that day in the runtime's time zone instead of UTC midnight. The default stays UTC. ActivityTimeline passes it, so east of UTC a date-only contact no longer outranks a timed one made earlier that same local day.
