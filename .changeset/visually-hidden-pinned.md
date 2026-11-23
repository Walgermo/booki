---
"@booki/styles": patch
---

Screen-reader-only text no longer widens the page on a phone. It was absolutely positioned at its static place, so inside a wide table (the voucher lines, a DataTable) it could sit outside every scroll box and push the page sideways. It is now pinned to the corner of its containing block.
