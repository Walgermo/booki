---
"@booki-aui/styles": patch
---

The styles build checks every output before it replaces `dist`, so a build that stops on the `base.css` size budget leaves the last good build in place instead of a `dist` with two files that a later packaging step takes for a complete one.
