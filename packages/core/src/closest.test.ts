import { describe, expect, it } from "vitest";
import { closest } from "./closest.js";
import { resolveChartAccount } from "./voucher.js";

const chart = Array.from({ length: 200 }, (_, i) => ({ number: String(1000 + i * 10), name: `Konto ${i}` })).concat([
  { number: "6801", name: "Kontorrekvisita" },
  { number: "7140", name: "Reisekostnad" },
]);
const text = (a: { number: string; name: string }) => `${a.number} ${a.name}`;

describe("closest", () => {
  it("finds by the start of a code and by the start of a word", () => {
    expect(closest(chart, "6800", text, 3)[0]).toMatchObject({ number: "6801" });
    expect(closest(chart, "reise", text, 1)[0]).toMatchObject({ number: "7140" });
    expect(closest(chart, "kontorrekvisitter", text, 1)[0]).toMatchObject({ number: "6801" });
  });

  it("gives the first ones when nothing is near, or nothing was asked", () => {
    expect(closest(chart, "zzzz", text, 2)).toEqual(chart.slice(0, 2));
    expect(closest(chart, "", text, 2)).toEqual(chart.slice(0, 2));
    expect(closest([], "x", text, 2)).toEqual([]);
  });
});

describe("a refused account in a long chart", () => {
  it("names the nearest accounts, not the first ones, and stays short", () => {
    let message = "";
    try {
      resolveChartAccount(chart, "6800");
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("6801 Kontorrekvisita");
    expect(message).toContain("202");
    expect(message.length).toBeLessThan(300);
  });
});
