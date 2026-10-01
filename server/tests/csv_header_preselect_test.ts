// Pins findEncodedCsvHeader (lib/utils.ts), which pre-selects a wizard's
// file-column picker when the file uses a core questionnaire column name.
//
//   deno test -A --env-file server/tests/csv_header_preselect_test.ts

import { assertEquals } from "@std/assert";
import { encodeRawCsvHeader, findEncodedCsvHeader } from "lib";

Deno.test("an exact match returns that header's encoded form", () => {
  assertEquals(
    findEncodedCsvHeader(["start", "id_fac_txt", "wgt"], "id_fac_txt"),
    encodeRawCsvHeader(1, "id_fac_txt"),
  );
});

Deno.test("no exact match returns the empty string", () => {
  assertEquals(
    findEncodedCsvHeader(["ID_FAC_TXT", " id_fac_txt", "id_fac"], "id_fac_txt"),
    "",
  );
  assertEquals(findEncodedCsvHeader([], "wgt"), "");
});

Deno.test("two equal headers resolve to the first", () => {
  assertEquals(
    findEncodedCsvHeader(["wgt", "a", "wgt"], "wgt"),
    encodeRawCsvHeader(0, "wgt"),
  );
});
