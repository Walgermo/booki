import { describe, expect, it } from "vitest";
import {
  activityIssues,
  completeTask,
  findActivity,
  lastTouch,
  logActivity,
  openTasks,
  overdueTasks,
  rescheduleTask,
  scheduleTask,
  timeline,
} from "./activity.js";
import { localize } from "./messages.js";

const NOW = "2026-11-24T12:00:00Z";

describe("activity rules", () => {
  it("logs what happened, refuses what has not, and points a task to scheduleTask", () => {
    const call = logActivity(
      { id: "A-1", kind: "call", subject: " Intro call ", at: "2026-11-20T09:30:00Z" },
      "kari",
      NOW,
    );
    expect(call).toEqual({ id: "A-1", kind: "call", subject: "Intro call", at: "2026-11-20T09:30:00Z", by: "kari" });
    expect(logActivity({ id: "A-2", kind: "note", subject: "Budget in Q1", at: "2026-11-24" }, "kari", NOW).at).toBe(
      "2026-11-24",
    );
    expect(() => logActivity({ id: "A-3", kind: "task", subject: "x", at: NOW }, "kari", NOW)).toThrow(
      /Kinds: call, email, meeting, note\. Something still to come is a task: scheduleTask/,
    );
    expect(() => logActivity({ id: "A-3", kind: "call", subject: "x", at: "2026-11-25" }, "kari", NOW)).toThrow(
      /has not happened yet/,
    );
    expect(() => logActivity({ id: "A-3", kind: "call", subject: "x", at: "20.11.2026" }, "kari", NOW)).toThrow(
      /YYYY-MM-DD or as an ISO time/,
    );
    expect(() => logActivity({ id: "A-3", kind: "call", subject: " ", at: NOW }, "kari", NOW)).toThrow(
      /cannot be empty/,
    );
  });

  it("schedules, reschedules and completes tasks once", () => {
    const task = scheduleTask({ id: "T-1", subject: "Send quote", dueDate: "2026-11-27" }, "agent", NOW);
    expect(task).toMatchObject({ kind: "task", dueDate: "2026-11-27", by: "agent" });
    expect(() => scheduleTask({ id: "T-2", subject: "x", dueDate: "next week" }, "agent", NOW)).toThrow(/YYYY-MM-DD/);
    expect(rescheduleTask(task, "2026-12-01").dueDate).toBe("2026-12-01");
    const done = completeTask(task, "agent", NOW);
    expect(done).toMatchObject({ doneAt: NOW, doneBy: "agent" });
    expect(() => completeTask(done, "agent", NOW)).toThrow(/already done/);
    const note = logActivity({ id: "A-1", kind: "note", subject: "x", at: NOW }, "kari", NOW);
    expect(() => completeTask(note, "agent", NOW)).toThrow(/is a note, not a task/);
  });

  it("orders the timeline, finds the next and overdue tasks and the last contact", () => {
    const items = [
      logActivity({ id: "A-1", kind: "note", subject: "Note", at: "2026-11-23T08:00:00Z" }, "kari", NOW),
      logActivity({ id: "A-2", kind: "email", subject: "Quote", at: "2026-11-22" }, "kari", NOW),
      logActivity(
        { id: "A-3", kind: "meeting", subject: "Demo", at: "2026-11-10T13:00:00Z", evidence: "cal:991" },
        "kari",
        NOW,
      ),
      scheduleTask({ id: "T-1", subject: "Follow up", dueDate: "2026-11-20" }, "kari", "2026-11-10T13:00:00Z"),
      scheduleTask({ id: "T-2", subject: "Renewal", dueDate: "2026-12-01" }, "kari", "2026-11-11T13:00:00Z"),
    ];
    expect(timeline(items).map((a) => a.id)).toEqual(["A-1", "A-2", "T-2", "A-3", "T-1"]);
    expect(openTasks(items).map((a) => a.id)).toEqual(["T-1", "T-2"]);
    expect(overdueTasks(items, "2026-11-24")).toEqual(["T-1"]);
    expect(lastTouch(items)?.id).toBe("A-2");
    expect(activityIssues(items[2]!, "2026-11-24")).toEqual([]);
    expect(activityIssues(items[3]!, "2026-11-24")[0]).toMatch(/was due 2026-11-20/);
    const unchecked = logActivity({ id: "A-9", kind: "call", subject: "Call", at: NOW }, "kari", NOW);
    expect(activityIssues(unchecked, "2026-11-24")[0]).toMatch(/nothing to check it against/);
    expect(() => findActivity(items, "nope")).toThrow(/Activities: A-1, A-2, A-3, T-1, T-2/);
  });

  it("reads in Norwegian", () => {
    try {
      logActivity({ id: "A-3", kind: "call", subject: "x", at: "2026-11-25" }, "kari", NOW);
    } catch (error) {
      expect(localize(error as Error, "nb")).toMatch(/ikke har skjedd ennå\. Planlegg en oppgave/);
    }
  });
});
