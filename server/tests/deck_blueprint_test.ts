// Deck blueprints, the pure half (lib/deck_blueprint.ts): a deck's layouts
// flatten to the blueprint grid, the skeleton carries a figure's metric and
// period kind but never its rows, filter values, run id or dates, the AI's
// judgement can only fill words and choose among the ids it was shown, the
// source's names left in the words are found, period roles resolve from the
// reporting period, the look fills its tokens and keeps the target's logos,
// and a blueprint survives the file round trip.
//
//   deno test -A --env-file server/tests/deck_blueprint_test.ts

import { assert, assertEquals } from "@std/assert";
import {
  addMonths,
  assembleBlueprint,
  type BlueprintDraftFromAI,
  buildBlueprintSkeleton,
  collectSourceTerms,
  type ContentBlock,
  deckConfigWithLook,
  findSourceTermHits,
  getStartingConfigForSlideDeck,
  gridFromLayout,
  normalizeSpans,
  parseDeckBlueprintFile,
  readDeckBlueprintProvenance,
  resolvePeriodRoles,
  serializeDeckBlueprint,
  type Slide,
  type SlideDeckConfig,
} from "lib";

// Only the fields the blueprint reads: the module never touches the rest.
function figure(args: {
  metricId: string;
  type?: string;
  filterBy?: { disOpt: string; values: string[] }[];
  periodFilter?: unknown;
  replicant?: string;
  caption?: string;
}): ContentBlock {
  return {
    type: "figure",
    bundle: {
      metricId: args.metricId,
      items: [{ admin_area_2: "Bo", value: 12.5 }],
      provenance: { runId: "run-secret-123" },
      config: {
        d: {
          type: args.type ?? "chart",
          filterBy: args.filterBy ?? [],
          periodFilter: args.periodFilter,
          selectedReplicantValue: args.replicant,
          disaggregateBy: [],
        },
        s: {},
        t: { caption: args.caption ?? "" },
      },
    },
  } as unknown as ContentBlock;
}

function text(markdown: string): ContentBlock {
  return { type: "text", markdown };
}

const SOURCE_SLIDES: Slide[] = [
  { type: "cover", title: "Sierra Leone Round 1 HFA", subtitle: "Q3 2025" },
  { type: "section", sectionTitle: "Service readiness" },
  {
    type: "content",
    header: "Readiness in Bo district",
    layout: {
      type: "cols",
      id: "a",
      children: [
        {
          type: "rows",
          id: "b",
          span: 8,
          children: [{
            type: "item",
            id: "c",
            data: figure({
              metricId: "m_readiness",
              filterBy: [{ disOpt: "admin_area_2", values: ["Bo District"] }],
              periodFilter: { filterType: "custom", min: 202507, max: 202509 },
              caption: "Readiness, Bo District",
            }),
          }],
        },
        {
          type: "rows",
          id: "d",
          span: 4,
          children: [{
            type: "item",
            id: "e",
            data: text("- Bo District readiness fell to 61%\n- Staffing gaps"),
          }],
        },
      ],
    },
  },
  {
    type: "content",
    header: "Trend",
    layout: {
      type: "rows",
      id: "f",
      children: [
        {
          type: "item",
          id: "g",
          data: figure({
            metricId: "m_trend",
            periodFilter: { filterType: "last_n_months", nMonths: 12 },
          }),
        },
        { type: "item", id: "h", data: { type: "image", imgFile: "x.png" } },
      ],
    },
    split: {
      placement: "left",
      sizeAsPct: 20,
      fill: { type: "image", imgFile: "photo.png" },
    },
  },
];

function sourceConfig(): SlideDeckConfig {
  const c = getStartingConfigForSlideDeck();
  return {
    ...c,
    theme: "ministry",
    headerSize: 1.2,
    globalFooterText: "Ministry of Health Sierra Leone · Q3 2025",
    logos: {
      ...c.logos,
      cover: { selected: ["moh.png", "gff.png"], showByDefault: true },
    },
  };
}

const PRESETS = {
  m_readiness: ["readiness_bar", "readiness_map"],
  m_trend: ["trend_line"],
};

function draft(): BlueprintDraftFromAI {
  return {
    name: "HFA round report",
    description: "Readiness by region with a trend.",
    footerPattern: "Ministry of Health {Country} · {Period}",
    periodRoles: [
      {
        id: "reporting",
        label: "Reporting period",
        kind: "reporting",
        months: 3,
      },
    ],
    topics: [
      {
        name: "Opening",
        purpose: "Title and section",
        scalingRule: "Always one cover and one section.",
        sourceSlideIndexes: [0, 1],
      },
      {
        name: "Readiness by region",
        purpose: "Show readiness where it is lowest",
        scalingRule: "One slide per region below 70%.",
        sourceSlideIndexes: [2],
      },
    ],
    slides: [
      { index: 0, titleBrief: "Country + round name", blocks: [] },
      { index: 1, titleBrief: "Section: service readiness", blocks: [] },
      {
        index: 2,
        headerBrief: "Readiness in <region>",
        blocks: [
          {
            purpose: "Readiness for the region",
            vizPresetId: "readiness_bar",
            periodRole: "reporting",
            filterIntent: "the region this slide is about",
          },
          { brief: "2 bullets: the readiness level, the main gap" },
        ],
      },
      {
        index: 3,
        headerBrief: "Trend",
        blocks: [{ purpose: "12-month trend", vizPresetId: "nope" }, {
          note: "a facility photo",
        }],
      },
    ],
  };
}

Deno.test("normalizeSpans sums to 12 and keeps proportions", () => {
  assertEquals(normalizeSpans([8, 4]), [8, 4]);
  assertEquals(normalizeSpans([undefined, undefined, undefined]), [4, 4, 4]);
  assertEquals(normalizeSpans([2, 2]), [6, 6]);
  assertEquals(normalizeSpans([undefined], 8), [8]);
  for (const spans of [[1, 1, 1, 1], [5, undefined], [11, 11, 11]]) {
    assertEquals(normalizeSpans(spans).reduce((a, b) => a + b, 0), 12);
  }
});

Deno.test("gridFromLayout: cols become one row at their spans", () => {
  const slide = SOURCE_SLIDES[2] as Extract<Slide, { type: "content" }>;
  const grid = gridFromLayout(slide.layout);
  assertEquals(grid.length, 1);
  assertEquals(grid[0].map((c) => c.span), [8, 4]);
  const stacked = SOURCE_SLIDES[3] as Extract<Slide, { type: "content" }>;
  assertEquals(gridFromLayout(stacked.layout).map((r) => r.length), [1, 1]);
});

Deno.test("skeleton carries no country data", () => {
  const sk = buildBlueprintSkeleton({
    deckLabel: "Round 1",
    config: sourceConfig(),
    slides: SOURCE_SLIDES,
  });
  const res = assembleBlueprint(sk, draft(), PRESETS, "2026-11-12T00:00:00Z");
  assert(res.success, res.success ? "" : res.err);
  const json = serializeDeckBlueprint(res.data);
  for (
    const leaked of [
      "run-secret-123",
      '"Bo"',
      "Bo District",
      "202507",
      "photo.png",
      "x.png",
      "moh.png",
      "12.5",
    ]
  ) {
    assert(!json.includes(leaked), `blueprint leaked ${leaked}`);
  }
  // The look: theme and settings carried, logos as counts.
  assertEquals(res.data.look.theme, "ministry");
  assertEquals(res.data.look.headerSize, 1.2);
  assertEquals(res.data.look.logoSlots.cover.count, 2);
  assertEquals(
    res.data.look.footerPattern,
    "Ministry of Health {Country} · {Period}",
  );
});

Deno.test("assemble: figures, periods, presets and orphans", () => {
  const sk = buildBlueprintSkeleton({
    deckLabel: "Round 1",
    config: sourceConfig(),
    slides: SOURCE_SLIDES,
  });
  const res = assembleBlueprint(sk, draft(), PRESETS, "2026-11-12T00:00:00Z");
  assert(res.success);
  const bp = res.data;
  // Slide 4 was not placed in a topic: it gets its own, in deck order.
  assertEquals(bp.topics.map((t) => t.name), [
    "Opening",
    "Readiness by region",
    "Slide 4",
  ]);
  assert(res.warnings.some((w) => w.includes("Slide 4 was not placed")));
  const readiness = bp.topics[1].slides[0];
  assert(readiness.type === "content");
  assertEquals(readiness.rows[0].map((c) => c.span), [8, 4]);
  const fig = readiness.rows[0][0].block;
  assert(fig.type === "figure");
  assertEquals(fig.vizPresetId, "readiness_bar");
  assertEquals(fig.period, { kind: "role", role: "reporting" });
  assertEquals(fig.filterIntent, "the region this slide is about");
  const txt = readiness.rows[0][1].block;
  assert(txt.type === "text");
  assertEquals(txt.targetWords, 8);
  assertEquals(txt.verbatimText, undefined);
  // A relative period stays relative; an unknown preset falls back with a
  // warning; an image becomes a slot; a picture split becomes plain + note.
  const trend = bp.topics[2].slides[0];
  assert(trend.type === "content");
  const tfig = trend.rows[0][0].block;
  assert(tfig.type === "figure");
  assertEquals(tfig.period, {
    kind: "relative",
    filter: { filterType: "last_n_months", nMonths: 12 },
  });
  assertEquals(tfig.vizPresetId, "trend_line");
  assert(res.warnings.some((w) => w.includes('using "trend_line"')));
  assertEquals(trend.rows[1][0].block, {
    type: "image_slot",
    note: "a facility photo",
  });
  assertEquals(trend.split?.fill, { type: "plain" });
  assert(trend.split?.imageNote);
});

Deno.test("keep word for word copies the source text", () => {
  const sk = buildBlueprintSkeleton({
    deckLabel: "Round 1",
    config: sourceConfig(),
    slides: SOURCE_SLIDES,
  });
  const d = draft();
  d.slides[2].blocks[1] = { brief: "methodology", keepVerbatim: true };
  const res = assembleBlueprint(sk, d, PRESETS, "2026-11-12T00:00:00Z");
  assert(res.success);
  const s = res.data.topics[1].slides[0];
  assert(s.type === "content");
  const b = s.rows[0][1].block;
  assert(b.type === "text" && b.keepVerbatim);
  assert(b.verbatimText?.includes("Staffing gaps"));
  // ...and the scan then finds the source's district in it.
  const terms = collectSourceTerms(sourceConfig(), SOURCE_SLIDES, [
    "Sierra Leone",
  ]);
  assert(terms.includes("Bo District"));
  const hits = findSourceTermHits(res.data, terms);
  assert(
    hits.some((h) => h.term === "Bo District" && h.where.includes("kept")),
  );
});

Deno.test("findSourceTermHits matches whole words only", () => {
  const sk = buildBlueprintSkeleton({
    deckLabel: "Round 1",
    config: sourceConfig(),
    slides: SOURCE_SLIDES,
  });
  const d = draft();
  d.topics[1].scalingRule = "One slide per district, as in Kenema.";
  const res = assembleBlueprint(sk, d, PRESETS, "2026-11-12T00:00:00Z");
  assert(res.success);
  const hits = findSourceTermHits(res.data, ["Kenema", "Bon"]);
  assertEquals(hits.map((h) => h.term), ["Kenema"]);
});

Deno.test("period roles resolve from the reporting period", () => {
  assertEquals(addMonths(202501, -1), 202412);
  assertEquals(addMonths(202412, 1), 202501);
  assertEquals(addMonths(202503, -14), 202401);
  const resolved = resolvePeriodRoles(
    [
      { id: "reporting", label: "Reporting", kind: "reporting", months: 3 },
      { id: "last_year", label: "Same quarter last year", kind: "comparison" },
      { id: "trend", label: "Two-year trend", kind: "trend", months: 24 },
    ],
    { start: 202507, end: 202509 },
  );
  assertEquals(resolved.map((r) => [r.start, r.end]), [
    [202507, 202509],
    [202407, 202409],
    [202310, 202509],
  ]);
});

Deno.test("look fills tokens and keeps the target's logos", () => {
  const sk = buildBlueprintSkeleton({
    deckLabel: "Round 1",
    config: sourceConfig(),
    slides: SOURCE_SLIDES,
  });
  const res = assembleBlueprint(sk, draft(), PRESETS, "2026-11-12T00:00:00Z");
  assert(res.success);
  const target = getStartingConfigForSlideDeck();
  target.logos.cover.selected = ["target_moh.png"];
  const next = deckConfigWithLook(target, res.data.look, {
    country: "Guinea",
    period: "2025-07 to 2025-09",
    year: "2025",
  });
  assertEquals(next.theme, "ministry");
  assertEquals(next.themeChosen, true);
  assertEquals(
    next.globalFooterText,
    "Ministry of Health Guinea · 2025-07 to 2025-09",
  );
  assertEquals(next.logos.cover.selected, ["target_moh.png"]);
});

Deno.test("file round trip and refusals", () => {
  const sk = buildBlueprintSkeleton({
    deckLabel: "Round 1",
    config: sourceConfig(),
    slides: SOURCE_SLIDES,
  });
  const res = assembleBlueprint(sk, draft(), PRESETS, "2026-11-12T00:00:00Z");
  assert(res.success);
  const text = serializeDeckBlueprint(res.data);
  const back = parseDeckBlueprintFile(text);
  assert(back.success);
  assertEquals(serializeDeckBlueprint(back.data), text);
  assert(!parseDeckBlueprintFile("not json").success);
  assert(!parseDeckBlueprintFile(JSON.stringify({ kind: "other" })).success);
  const future = parseDeckBlueprintFile(
    JSON.stringify({ ...JSON.parse(text), formatVersion: 99 }),
  );
  assert(!future.success && future.err.includes("format 99"));
});

Deno.test("provenance reads only its own kind", () => {
  assertEquals(readDeckBlueprintProvenance(""), undefined);
  assertEquals(readDeckBlueprintProvenance("free text plan"), undefined);
  assertEquals(
    readDeckBlueprintProvenance(JSON.stringify({ kind: "x" })),
    undefined,
  );
});
