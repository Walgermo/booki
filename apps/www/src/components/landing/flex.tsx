import { AmountField, BankAccountInput, BookiLocaleProvider, TaxCodeSelect } from "@booki/react";
import { elementOf } from "@ui-sdk/react/observe";
import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { Section } from "@/components/section";
import { TwoReaders } from "@/components/two-readers";
import { useLang } from "@/lib/lang";
import type { LandingAgent } from "./shared";

type Country = "NO" | "US";

/** Each look is a theme attribute or a handful of token overrides. No component code changes. */
const LOOKS: {
  name: string;
  label: { en: string; nb: string };
  theme?: "dark" | "light";
  vars: Record<string, string>;
}[] = [
  { name: "Paper", label: { en: "Paper", nb: "Papir" }, theme: "light", vars: {} },
  { name: "Night", label: { en: "Night", nb: "Natt" }, theme: "dark", vars: {} },
  {
    name: "Your brand",
    label: { en: "Your brand", nb: "Deres merkevare" },
    theme: "light",
    vars: {
      "--bk-radius-sm": "0",
      "--bk-radius": "0",
      "--bk-wood": "oklch(0.93 0.03 150)",
      "--bk-accent": "oklch(0.95 0.025 150)",
      "--bk-border-strong": "oklch(0.55 0.08 150)",
      "--bk-primary": "oklch(0.35 0.08 150)",
    },
  },
];

/**
 * A ui-sdk SegmentedControl: one value, one tab stop, arrow keys, and an
 * agent sees it in the snapshot and can pick a value over the bridge.
 */
function Switch<T extends string>({
  label,
  options,
  value,
  onChange,
  labelOf = (option) => option,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  labelOf?: (option: T) => string;
}) {
  return (
    <div className="grid gap-2">
      <p className="site-label" aria-hidden="true">
        {label}
      </p>
      <SegmentedControl
        className="site-segmented"
        aria-label={label}
        value={value}
        onValueChange={(next) => {
          if (next) onChange(next as T);
        }}
      >
        <SegmentedControlIndicator />
        {options.map((option) => (
          <SegmentedControlItem key={option} value={option}>
            {labelOf(option)}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </div>
  );
}

/**
 * One form, switched live. The person's view changes with country and look;
 * the agent's view changes only where the data does (currency, VAT codes,
 * which bank format), and never with the look.
 */
export function Flex({ agent }: { agent: LandingAgent }) {
  const { lang, t } = useLang();
  const [country, setCountry] = useState<Country>("NO");
  const [look, setLook] = useState("Paper");
  const [machine, setMachine] = useState("");
  const box = useRef<HTMLDivElement | null>(null);
  const active = LOOKS.find((item) => item.name === look) ?? LOOKS[0]!;

  useEffect(() => {
    const read = () => {
      const mine = agent
        .snapshot()
        .filter((entry) => box.current?.contains(elementOf(entry.ref) ?? null))
        .map(({ ref: _ref, ...rest }) => rest);
      setMachine(JSON.stringify(mine, null, 2));
    };
    // Read after the bridge has finished notifying, never inside a change.
    let timer = 0;
    const later = () => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        read();
      }, 0);
    };
    later();
    const unsubscribe = agent.subscribe(later);
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [agent, country]);

  return (
    <Section
      id="flex-title"
      title={t("Flexible", "Fleksibelt")}
      note={t(
        "Controls ship unstyled, and a country is data. Switch the look and only the person's view changes. Switch the country and the agent learns new rules.",
        "Kontrollene leveres uten stil, og et land er data. Bytt utseende, og bare det personen ser, endres. Bytt land, og agenten lærer nye regler.",
      )}
    >
      <div className="grid gap-6">
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <Switch label={t("Country", "Land")} options={["NO", "US"] as const} value={country} onChange={setCountry} />
          <Switch
            label={t("Look", "Utseende")}
            options={LOOKS.map((item) => item.name)}
            value={look}
            onChange={setLook}
            labelOf={(name) => LOOKS.find((item) => item.name === name)?.label[lang] ?? name}
          />
        </div>
        <TwoReaders
          person={
            <div
              ref={box}
              data-bk-theme={active.theme}
              className="-m-5 grid min-w-0 gap-4 rounded-[var(--bk-radius-lg)] bg-background p-5 text-foreground sm:-m-6 sm:p-6"
              style={active.vars as CSSProperties}
            >
              <BookiLocaleProvider country={country}>
                <AmountField defaultValue={1_234_567_890} />
                <TaxCodeSelect />
                <BankAccountInput />
              </BookiLocaleProvider>
            </div>
          }
          machine={machine}
        />
      </div>
    </Section>
  );
}
