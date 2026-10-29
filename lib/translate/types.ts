import type { TranslatableString as PantherTranslatableString } from "@timroberton/panther";

export const LANGUAGES = ["en", "fr", "pt"] as const;
export type Language = (typeof LANGUAGES)[number];

// Portuguese is optional: a string without it reads in English.
export type RequiredLanguage = "en" | "fr";
export type TranslatableString = PantherTranslatableString<RequiredLanguage>;
