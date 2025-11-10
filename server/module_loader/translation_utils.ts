import { type InstanceLanguage } from "lib";
import { _LANGAUGE_MAP_CONTENT } from "./language_map_content.ts";

/**
 * Get a translation function for the given language
 * @param language - The language to translate to
 * @returns A function that translates text, or returns the original text for English
 */
export function getTranslateFunc(
  language: InstanceLanguage
): (text: string) => string {
  if (language === "en") {
    return (v: string) => v;
  }
  return (v: string) => {
    // Normalize newlines to match the format in _LANGAUGE_MAP_CONTENT
    const normalizedKey = v.replace(/\n/g, "\\n");
    return _LANGAUGE_MAP_CONTENT.get(normalizedKey) ?? v;
  };
}
