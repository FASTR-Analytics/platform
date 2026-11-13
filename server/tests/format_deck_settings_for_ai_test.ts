// Pins the deck's settings as `get_deck` prints them and `update_deck_settings`
// returns them: the logos by section under their stored names, the logos that
// can be selected, the footer text and the watermark, and nothing of the
// theme or of the fields no renderer reads.
//
//   deno test -A --no-check server/tests/format_deck_settings_for_ai_test.ts

import { assert, assertStringIncludes } from "@std/assert";
import { formatDeckSettingsForAI } from "../../lib/ai_tools/format_deck_settings_for_ai.ts";
import {
  getStartingConfigForSlideDeck,
  type SlideDeckConfig,
} from "../../lib/types/slides.ts";

const BUILT_IN = [
  { value: "images/FASTR_Primary_01_Horiz.png", label: "FASTR (colored)" },
];

const CONFIGURED: SlideDeckConfig = {
  ...getStartingConfigForSlideDeck(),
  logos: {
    availableCustom: ["moh.png"],
    cover: {
      selected: ["moh.png", "images/FASTR_Primary_01_Horiz.png"],
      sizing: { size: "lg" },
      showByDefault: true,
    },
    header: { selected: [], showByDefault: true },
    footer: { selected: ["moh.png"], showByDefault: false },
  },
  globalFooterText: "Round 1",
  useWatermark: true,
  watermarkText: "DRAFT",
  theme: "default",
};

Deno.test("the logos read by section under their stored names", () => {
  const text = formatDeckSettingsForAI(CONFIGURED, BUILT_IN);
  assertStringIncludes(
    text,
    '"images/FASTR_Primary_01_Horiz.png" (FASTR (colored))',
  );
  assertStringIncludes(
    text,
    'logos.availableCustom (the deck\'s own logos, selectable in any section): "moh.png"',
  );
  assertStringIncludes(
    text,
    'logos.cover.selected: "moh.png", "images/FASTR_Primary_01_Horiz.png"',
  );
  assertStringIncludes(text, 'logos.cover.sizing: {"size":"lg"}');
  assertStringIncludes(text, "logos.header.selected: none");
  assertStringIncludes(text, "logos.header.sizing: default");
  assertStringIncludes(text, "logos.footer.showByDefault: false");
});

Deno.test("the footer text and the watermark read as stored", () => {
  const text = formatDeckSettingsForAI(CONFIGURED, BUILT_IN);
  assertStringIncludes(
    text,
    'globalFooterText: "Round 1" (every content slide shows it in place of its own footer)',
  );
  assertStringIncludes(text, "useWatermark: true");
  assertStringIncludes(text, 'watermarkText: "DRAFT"');
});

Deno.test("an unset footer text says each slide shows its own", () => {
  const text = formatDeckSettingsForAI(
    getStartingConfigForSlideDeck(),
    BUILT_IN,
  );
  assertStringIncludes(
    text,
    "globalFooterText: not set (each content slide shows its own footer)",
  );
  assertStringIncludes(
    text,
    "logos.availableCustom (the deck's own logos, selectable in any section): none",
  );
});

Deno.test("the theme and the fields no renderer reads are not shown", () => {
  const text = formatDeckSettingsForAI(CONFIGURED, BUILT_IN);
  for (const absent of ["theme", "showPageNumbers", "headerSize"]) {
    assert(!text.includes(absent), `${absent} is shown`);
  }
});
