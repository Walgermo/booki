import { createMessages } from "./message-render.js";

export const LOCALE_EN = {
  "locale.no-profile":
    'No profile for country "{country}". Built in: {countries}. Pass your own with defineProfile and the provider\'s `profiles` prop.',
} as const;

export const localeMessages = /* @__PURE__ */ createMessages(LOCALE_EN);
