---
"@booki-aui/core": patch
---

`forecastByPeriod` counts only deals closing within `from` to `to`, so totals no longer change when a quarter starts before the range. `timeInStage` takes the mean of the two middle stays for an even count, and counts the time that passed for a finished stay with times at both ends. `funnel` finds the biggest drop from exact shares, so a loss that rounds to 0.0 % still counts. `setDealValue` drops the old source when the figure changes and no new source is given, even with a status.
