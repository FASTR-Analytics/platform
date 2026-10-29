// Pins the geojson wizard's area-name matching (SYSTEM_05 "Map boundaries"):
// the normalizer folds what a name carries invisibly or by spelling, and the
// auto-mapper proposes a pairing only when the normalized name is unambiguous.
//
//   deno test -A --env-file server/tests/geojson_area_match_test.ts

import { assertEquals } from "@std/assert";
import { autoMapAreaNames, normalizeAreaName } from "lib";

Deno.test("an NFD and an NFC spelling of one accented name match", () => {
  const nfc = "Boké".normalize("NFC");
  const nfd = "Boké".normalize("NFD");
  assertEquals(normalizeAreaName(nfc), normalizeAreaName(nfd));
  assertEquals(autoMapAreaNames([nfd], [nfc]).mapping, { [nfd]: nfc });
});

Deno.test("an accented name matches its unaccented spelling", () => {
  assertEquals(autoMapAreaNames(["Boké"], ["Boke"]).mapping, {
    "Boké": "Boke",
  });
});

Deno.test("surrounding and non-breaking spaces are folded", () => {
  assertEquals(
    autoMapAreaNames([" Kindia ", "Labé  Centre"], [
      "Kindia",
      "Labé Centre",
    ]).mapping,
    { " Kindia ": "Kindia", "Labé  Centre": "Labé Centre" },
  );
});

Deno.test("case is folded", () => {
  assertEquals(autoMapAreaNames(["KANKAN"], ["Kankan"]).mapping, {
    KANKAN: "Kankan",
  });
});

Deno.test("Turkish dotless i is left unmatched rather than mismatched", () => {
  assertEquals(autoMapAreaNames(["Sırnak"], ["Sirnak"]), {
    mapping: {},
    unmatched: ["Sırnak"],
  });
});

Deno.test("two areas that differ only by accent are not guessed between", () => {
  assertEquals(autoMapAreaNames(["Boke"], ["Boké", "BOKE"]), {
    mapping: {},
    unmatched: ["Boke"],
  });
  assertEquals(autoMapAreaNames(["Boké"], ["Boké", "BOKE"]).mapping, {
    "Boké": "Boké",
  });
});
