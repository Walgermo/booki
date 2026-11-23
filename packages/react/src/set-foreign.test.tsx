import { localize } from "@booki/core/messages";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createBookiAgent } from "./booki-agent.js";
import { BookiLocaleProvider } from "./locale.js";
import { VoucherComposer } from "./voucher-composer.js";

afterEach(() => cleanup());

// In a trial run an agent needed five failed calls to find setForeign's
// arguments: the snapshot had no hint for it, and a refusal said only "got NaN".

type Result = { ok: boolean; error?: { message: string } };

function setup(country: "NO" | "US" = "US") {
  const agent = createBookiAgent({ agentId: "test" });
  render(
    <BookiLocaleProvider defaultCountry={country}>
      {/* The base currency is the country profile's. */}
      <VoucherComposer
        accounts={[
          { number: "6800", name: "Office" },
          { number: "2400", name: "Payables" },
        ]}
        defaultLines={[{ id: "a", account: "6800", accountName: "Office", debitMinor: 1, creditMinor: 0 }]}
        aria-label="Voucher"
      />
    </BookiLocaleProvider>,
  );
  const act = (args: unknown[]) =>
    agent.act({ steps: [{ ref: "Voucher", action: "setForeign", args }] }) as Promise<Result>;
  const entry = () =>
    agent.snapshot().find((c) => c.component === "voucher-composer") as unknown as Record<string, any>;
  return { act, entry };
}

describe("VoucherComposer setForeign", () => {
  it("shows how to call it in the snapshot, with the units", () => {
    const { entry } = setup();
    expect(entry().foreignFormat).toMatch(/setForeign\(lineId, "USD", 42000, 10500000\)/);
    expect(entry().foreignFormat).toMatch(/minor units/);
    expect(entry().foreignFormat).toMatch(/millionths/);
  });

  it("takes the three values as arguments or as one object", async () => {
    const { act, entry } = setup();
    expect((await act(["a", "EUR", 100_000, 11_725_000])).ok).toBe(true);
    expect(entry().lines[0]).toMatchObject({
      debitMinor: 1_172_500,
      foreign: { currency: "EUR", amountMinor: 100_000 },
    });
    expect((await act(["a"])).ok).toBe(true);
    expect(entry().lines[0].foreign).toBeUndefined();
    expect((await act(["a", { currency: "eur", amountMinor: 100_000, rateScaled: 11_725_000 }])).ok).toBe(true);
    expect(entry().lines[0]).toMatchObject({
      debitMinor: 1_172_500,
      foreign: { currency: "EUR", rateScaled: 11_725_000 },
    });
  });

  it("refuses a decimal rate and says the rate is in millionths, with the call written out", async () => {
    const { act, entry } = setup();
    const result = await act(["a", "EUR", 100_000, 11.725]);
    expect(result.ok).toBe(false);
    expect(result.error?.message).toMatch(/rate is a whole number of millionths/);
    expect(result.error?.message).toMatch(/got 11\.725/);
    expect(result.error?.message).toMatch(/setForeign\(lineId, "USD", 42000, 10500000\)/);
    expect(entry().lines[0].foreign).toBeUndefined();
  });

  it("refuses a decimal amount and names the unit", async () => {
    const { act } = setup();
    const result = await act(["a", "EUR", 1000.5, 11_725_000]);
    expect(result.error?.message).toMatch(/amount is a whole number of minor units of the foreign currency/);
  });

  it("refuses arguments in another order by naming the one that is wrong", async () => {
    const { act } = setup();
    // amount, currency, rate: the first value is not a currency code.
    expect((await act(["a", 100_000, "EUR", 11_725_000])).error?.message).toMatch(/currency is a three-letter code/);
    // a missing rate is named, not reported as NaN.
    const missing = await act(["a", "EUR", 100_000]);
    expect(missing.error?.message).toMatch(/rate is a whole number of millionths/);
    expect(missing.error?.message).not.toMatch(/NaN/);
  });

  it("refuses an unknown field of the object and lists the fields", async () => {
    const { act } = setup();
    const result = await act(["a", { currency: "EUR", amount: 100_000, rate: 11.725 }]);
    expect(result.error?.message).toMatch(/currency, amountMinor, rateScaled/);
  });

  it("has each refusal in Norwegian too", async () => {
    const { act } = setup();
    const rate = (await act(["a", "EUR", 100_000, 11.725])).error!.message;
    const amount = (await act(["a", "EUR", 1000.5, 11_725_000])).error!.message;
    const currency = (await act(["a", "euro", 100_000, 11_725_000])).error!.message;
    expect(localize(rate, "nb")).toMatch(/kursen er et heltall i milliondeler/);
    expect(localize(amount, "nb")).toMatch(/beløpet er et heltall i minste enhet/);
    expect(localize(currency, "nb")).toMatch(/valutaen er en kode på tre bokstaver/);
  });
});
