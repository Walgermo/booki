import { logActivity } from "@booki-aui/core/activity";
import { describe, expect, it } from "vitest";
import { derive } from "./activity-timeline.js";

describe("activity timeline order", () => {
  it("ranks a day-only contact at the start of the person's day, not UTC midnight", () => {
    const zone = process.env.TZ;
    process.env.TZ = "Europe/Oslo";
    try {
      const now = "2026-11-24T23:10:00Z";
      // A call at 00:05 Oslo time on 25 November, then an email logged for that day.
      const call = logActivity(
        { id: "A-1", kind: "call", subject: "Call", at: "2026-11-24T23:05:00Z", evidence: "x" },
        "kari",
        now,
      );
      const email = logActivity({ id: "A-2", kind: "email", subject: "Mail", at: "2026-11-25" }, "kari", now, "2026-11-25");
      const view = derive([email, call], "2026-11-25");
      expect(view.lastTouch?.id).toBe("A-1");
      expect(view.timeline.map((item) => item.id)).toEqual(["A-1", "A-2"]);
    } finally {
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    }
  });
});
