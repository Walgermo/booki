import type { CountryCode } from "@booki/core/locale";
import { useBookiLocaleOptional } from "./locale.js";

const OPTIONS: { code: CountryCode; label: string }[] = [
  { code: "NO", label: "Norway" },
  { code: "US", label: "United States" },
];

export type CountryToggleProps = {
  className?: string;
  value?: CountryCode;
  onValueChange?: (country: CountryCode) => void;
  /** The countries to offer. Defaults to Norway and the United States. */
  options?: { code: CountryCode; label: string }[];
};

function CountryToggle({ className, value, onValueChange, options = OPTIONS }: CountryToggleProps) {
  const { country, setCountry } = useBookiLocaleOptional();
  const current = value ?? country;

  return (
    <div data-slot="country-toggle" role="group" aria-label="Country" className={className}>
      {options.map((option) => {
        const selected = current === option.code;
        return (
          <button
            key={option.code}
            type="button"
            data-selected={selected ? "true" : "false"}
            aria-pressed={selected}
            onClick={() => {
              setCountry(option.code);
              onValueChange?.(option.code);
            }}
          >
            <span data-slot="country-toggle-code">{option.code}</span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export { CountryToggle };
