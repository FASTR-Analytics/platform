// `reportLiveFigures` is the one notion of "a figure the reader can see":
// registered AND embedded by a token in the body. Pure: no database.
//
//   deno test -A --no-check server/tests/report_live_figures_test.ts

import { assertEquals } from "@std/assert";
import { buildReportEmbedToken, reportLiveFigures } from "lib";

const LIVE_TABLE = "5eea3e02-0000-4000-8000-000000000001";
const LIVE_SERIES = "6553e24d-0000-4000-8000-000000000002";
const ORPHAN = "7c0d9a1f-0000-4000-8000-000000000003";
const IMAGE = "a1b2c3d4-0000-4000-8000-000000000004";

// The helper reads no part of an entry, so the fixture is the caption alone.
const block = (caption: string) => ({ caption });

// The run's own shape: `replace_figure` swapped the orphan's token for a fresh
// id and left its registry entry behind, carrying the caption the user asked
// to keep, so the index offered three figures for a two-figure report.
const REGISTRY = {
  [ORPHAN]: block("REPORT FIGURE CAPTION"),
  [LIVE_TABLE]: block("Immunization Indicators (Feb-Apr 2025)"),
  [LIVE_SERIES]: block("ANC4 National Coverage Trend"),
};

const BODY = [
  "# Immunization",
  "",
  buildReportEmbedToken("figure", LIVE_TABLE, "Immunization Indicators"),
  "",
  "Antenatal care.",
  "",
  buildReportEmbedToken("figure", LIVE_SERIES, "ANC4 National Coverage Trend"),
  "",
  buildReportEmbedToken("image", IMAGE, "A logo"),
  "",
  // The orphan's id in prose is not an embed: only a token counts.
  `The figure ${ORPHAN} was replaced.`,
].join("\n");

Deno.test("an unreferenced figure is not a live figure", () => {
  const live = reportLiveFigures(BODY, REGISTRY);
  assertEquals(Object.keys(live), [LIVE_TABLE, LIVE_SERIES]);
  assertEquals(live[LIVE_TABLE], REGISTRY[LIVE_TABLE]);
  assertEquals(live[ORPHAN], undefined);
});

Deno.test("an image token never makes a figure live", () => {
  const withImageId = {
    ...REGISTRY,
    [IMAGE]: block("Same id as the image"),
  };
  assertEquals(
    Object.keys(reportLiveFigures(BODY, withImageId)),
    [LIVE_TABLE, LIVE_SERIES],
  );
});

Deno.test("a body embedding nothing has no live figures", () => {
  assertEquals(reportLiveFigures("# Just a heading\n", REGISTRY), {});
  assertEquals(reportLiveFigures("", REGISTRY), {});
});

Deno.test("a token for an id the report does not hold adds nothing", () => {
  const body = `${BODY}\n\n${
    buildReportEmbedToken(
      "figure",
      "deadbeef-0000-4000-8000-000000000009",
      "Gone",
    )
  }`;
  assertEquals(
    Object.keys(reportLiveFigures(body, REGISTRY)),
    [LIVE_TABLE, LIVE_SERIES],
  );
});

Deno.test("the order is the registry's, not the body's", () => {
  // The body embeds the series first; the index must still read in registry
  // order, so it is stable across an edit that only moves a token.
  const reordered = [
    buildReportEmbedToken("figure", LIVE_SERIES, "ANC4"),
    buildReportEmbedToken("figure", LIVE_TABLE, "Immunization"),
  ].join("\n\n");
  assertEquals(
    Object.keys(reportLiveFigures(reordered, REGISTRY)),
    [LIVE_TABLE, LIVE_SERIES],
  );
});

Deno.test("an embedded figure twice over is listed once", () => {
  const twice = [
    buildReportEmbedToken("figure", LIVE_TABLE, "First"),
    buildReportEmbedToken("figure", LIVE_TABLE, "Second"),
  ].join("\n\n");
  assertEquals(Object.keys(reportLiveFigures(twice, REGISTRY)), [LIVE_TABLE]);
});
