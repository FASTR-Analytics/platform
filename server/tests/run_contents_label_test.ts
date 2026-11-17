// Pins the package contents and display labels: family names joined by `+`,
// the module count with an `m`, single spaces between parts, and an empty
// part left out.
//
//   deno task test:files server/tests/run_contents_label_test.ts

import { assertEquals } from "@std/assert";
import {
  packageContentsLabel,
  packageDisplayLabel,
} from "../../lib/run_contents_label.ts";

Deno.test("contents label: families then module count", () => {
  assertEquals(
    packageContentsLabel({ families: ["hmis", "hfa"], moduleCount: 6 }),
    "HMIS+HFA 6m",
  );
  assertEquals(
    packageContentsLabel({ families: ["hfa"], moduleCount: 1 }),
    "HFA 1m",
  );
});

Deno.test("contents label: an unknown part is left out", () => {
  assertEquals(
    packageContentsLabel({ families: ["hfa"], moduleCount: null }),
    "HFA",
  );
  assertEquals(
    packageContentsLabel({ families: null, moduleCount: 2 }),
    "2m",
  );
  assertEquals(
    packageContentsLabel({ families: null, moduleCount: null }),
    "",
  );
});

Deno.test("display label: the label then its contents", () => {
  assertEquals(
    packageDisplayLabel({
      label: "2026-11-14",
      families: ["hmis"],
      moduleCount: 6,
    }),
    "2026-11-14 HMIS 6m",
  );
  assertEquals(
    packageDisplayLabel({
      label: "2026-11-14",
      families: null,
      moduleCount: null,
    }),
    "2026-11-14",
  );
});
