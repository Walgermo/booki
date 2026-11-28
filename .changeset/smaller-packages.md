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

Smaller packages: the published files no longer include source maps (`dist` is plain ES2022 already), and `@booki-aui/styles` no longer ships its `src` folder, which nothing could import. The tarballs are about half the size. A `DataTable` now loads only the table's own sentences instead of the whole English catalogue, which cuts its first load from 39 KB to 23 KB gzipped. New entries `@booki-aui/core/msg/table` and `@booki-aui/core/msg/agent-input` hold those sentences.
