import { formatDeckSettingsForAI, type SlideDeckConfig } from "lib";
import { FASTR_LOGOS } from "~/generate_slide_deck/fastr_logos";

const BUILT_IN_LOGOS = FASTR_LOGOS.map((l) => ({
  value: l.value,
  label: l.label.en,
}));

export function formatDeckSettings(config: SlideDeckConfig): string {
  return formatDeckSettingsForAI(config, BUILT_IN_LOGOS);
}
