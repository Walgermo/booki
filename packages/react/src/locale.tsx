import { getBookiProfile, type CountryCode, type BookiLocaleProfile } from "@booki/core/locale";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { preloadNorwegian } from "./say.js";

export type BookiLocaleContextValue = {
  country: CountryCode;
  profile: BookiLocaleProfile;
  setCountry: (country: CountryCode) => void;
};

const BookiLocaleContext = createContext<BookiLocaleContextValue | null>(null);

export type BookiLocaleProviderProps = {
  children: ReactNode;
  defaultCountry?: CountryCode;
  country?: CountryCode;
  onCountryChange?: (country: CountryCode) => void;
  /** Profiles for countries Booki does not ship, by code. See `defineProfile`. */
  profiles?: Record<string, BookiLocaleProfile>;
};

function BookiLocaleProvider({
  children,
  defaultCountry = "NO",
  country: controlled,
  onCountryChange,
  profiles,
}: BookiLocaleProviderProps) {
  const [uncontrolled, setUncontrolled] = useState<CountryCode>(defaultCountry);
  const country = controlled ?? uncontrolled;
  // Norwegian refusals read from a catalogue fetched on demand: start it now.
  useEffect(() => {
    if (country === "NO") void preloadNorwegian();
  }, [country]);

  const setCountry = useCallback(
    (next: CountryCode) => {
      if (controlled === undefined) setUncontrolled(next);
      onCountryChange?.(next);
    },
    [controlled, onCountryChange],
  );

  const value = useMemo<BookiLocaleContextValue>(
    () => ({
      country,
      profile: getBookiProfile(country, profiles),
      setCountry,
    }),
    [country, setCountry, profiles],
  );

  return <BookiLocaleContext.Provider value={value}>{children}</BookiLocaleContext.Provider>;
}

function useBookiLocale(): BookiLocaleContextValue {
  const ctx = useContext(BookiLocaleContext);
  if (!ctx) {
    throw new Error("useBookiLocale must be used within BookiLocaleProvider");
  }
  return ctx;
}

function useBookiLocaleOptional(): BookiLocaleContextValue {
  const ctx = useContext(BookiLocaleContext);
  return (
    ctx ?? {
      country: "NO",
      profile: getBookiProfile("NO"),
      setCountry: () => undefined,
    }
  );
}

export { BookiLocaleProvider, useBookiLocale, useBookiLocaleOptional };
