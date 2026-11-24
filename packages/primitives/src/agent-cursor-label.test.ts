import { describe, expect, it } from "vitest";
import { cursorLabelRoom } from "./agent-cursor.js";

describe("the cursor's label stays inside the window", () => {
  it("sits right of the pointer with room to spare", () => {
    expect(cursorLabelRoom(200, 1280)).toEqual({ flip: false, room: 1050 });
  });

  it("goes left of the pointer near the right edge, with the room on that side", () => {
    expect(cursorLabelRoom(1200, 1280)).toEqual({ flip: true, room: 1176 });
  });

  it("never offers less than a short label's width", () => {
    expect(cursorLabelRoom(300, 320).room).toBeGreaterThanOrEqual(80);
  });
});
