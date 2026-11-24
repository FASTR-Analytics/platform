// Pins the copilot's slide schemas to the stored ones: every stored field of a
// slide type is one the copilot can create and update, unless it is named
// below with the reason it is left out. Pins what replace_slide keeps, and
// the layout rows update_slide's layoutChange accepts.
//
//   deno test -A --no-check server/tests/ai_slide_schema_test.ts

import { assertEquals } from "@std/assert";
import {
  _GLOBAL_LAYOUT_COLUMNS,
  AiContentSlideSchema,
  AiCoverSlideSchema,
  AiSectionSlideSchema,
  AiSlideUpdateSchema,
  AiTextBlockSchema,
  type ContentSlide,
  type CoverSlide,
  LayoutSpecSchema,
  withKeptSlideSettings,
} from "lib";
import {
  contentSlideSchema,
  coverSlideSchema,
  sectionSlideSchema,
  textBlockSchema,
} from "../../lib/types/_slide_config.ts";

const EXCLUDED: Record<string, readonly string[]> = {
  cover: [],
  section: [],
  // Written through blocks and layoutChange.
  content: ["layout"],
};

// The renderer ignores it and the editor offers no control for it.
const EXCLUDED_TEXT_STYLE = ["textSize"];

function missing(
  stored: string[],
  offered: string[],
  excluded: readonly string[],
) {
  return stored.filter((k) => !offered.includes(k) && !excluded.includes(k));
}

function updateOption(type: string) {
  const option = AiSlideUpdateSchema.options.find((o) =>
    o.shape.type.safeParse(type).success
  );
  if (!option) throw new Error(`No update option for ${type}`);
  return option;
}

const CASES = [
  { type: "cover", stored: coverSlideSchema, create: AiCoverSlideSchema },
  { type: "section", stored: sectionSlideSchema, create: AiSectionSlideSchema },
  { type: "content", stored: contentSlideSchema, create: AiContentSlideSchema },
] as const;

for (const { type, stored, create } of CASES) {
  Deno.test(`every stored ${type} slide field can be created`, () => {
    assertEquals(
      missing(
        Object.keys(stored.shape),
        Object.keys(create.shape),
        EXCLUDED[type],
      ),
      [],
    );
  });

  Deno.test(`every stored ${type} slide field can be updated`, () => {
    assertEquals(
      missing(
        Object.keys(stored.shape),
        Object.keys(updateOption(type).shape),
        EXCLUDED[type],
      ),
      [],
    );
  });
}

Deno.test("every stored text block style field can be written", () => {
  assertEquals(
    missing(
      Object.keys(textBlockSchema.shape.style.unwrap().shape),
      Object.keys(AiTextBlockSchema.shape.style.unwrap().shape),
      EXCLUDED_TEXT_STYLE,
    ),
    [],
  );
});

const COVER: CoverSlide = {
  type: "cover",
  title: "Old title",
  subtitle: "Old subtitle",
  titleBold: false,
  titleTextRelFontSize: 12,
  showLogos: "hide",
};

const CONTENT: ContentSlide = {
  type: "content",
  header: "Old header",
  subHeader: "Old sub-header",
  footer: "Old footer",
  split: { placement: "left", sizeAsPct: 20, fill: { type: "plain" } },
  layout: {
    type: "item",
    id: "a1b",
    data: { type: "text", markdown: "Old text" },
  },
};

Deno.test("a replaced slide that keeps its type keeps the settings its input does not name", () => {
  assertEquals(
    withKeptSlideSettings(COVER, {
      type: "cover",
      title: "New title",
      titleBold: true,
    }),
    {
      type: "cover",
      title: "New title",
      titleBold: true,
      titleTextRelFontSize: 12,
      showLogos: "hide",
    },
  );
  assertEquals(
    withKeptSlideSettings(CONTENT, {
      type: "content",
      header: "New header",
      footer: "New footer",
      blocks: [{ type: "text", markdown: "New text" }],
    }),
    {
      type: "content",
      header: "New header",
      subHeader: "Old sub-header",
      footer: "New footer",
      split: { placement: "left", sizeAsPct: 20, fill: { type: "plain" } },
      blocks: [{ type: "text", markdown: "New text" }],
    },
  );
});

Deno.test("a replaced slide that changes its type keeps nothing", () => {
  const input = {
    type: "section" as const,
    sectionTitle: "New section",
  };
  assertEquals(withKeptSlideSettings(COVER, input), input);
});

// A layoutChange row whose spans cannot fill its columns is refused by the
// schema, so the model is told before anything runs and normalizeSpans only
// ever shares out columns that exist. The oracle is a search: a row is
// accepted exactly when its cells without a span can be given 1 column or
// more each so that the row fills its columns.
Deno.test("a layout row is accepted exactly when its spans can fill its columns", () => {
  const SPANS = [
    undefined,
    ...Array.from({ length: _GLOBAL_LAYOUT_COLUMNS }, (_, i) => i + 1),
  ];
  const fill = (cells: number, left: number): boolean =>
    cells === 0
      ? left === 0
      : SPANS.slice(1).some((s) => fill(cells - 1, left - s!));
  const fillable = (spans: (number | undefined)[]): boolean =>
    fill(
      spans.filter((s) => s === undefined).length,
      _GLOBAL_LAYOUT_COLUMNS - spans.reduce<number>((t, s) => t + (s ?? 0), 0),
    );
  const rows: (number | undefined)[][] = [
    ...SPANS.map((a) => [a]),
    ...SPANS.flatMap((a) => SPANS.map((b) => [a, b])),
    ...SPANS.flatMap((a) => SPANS.flatMap((b) => SPANS.map((c) => [a, b, c]))),
  ];
  for (const spans of rows) {
    const row = spans.map((span) =>
      span === undefined ? { block: "a1b" } : { block: "a1b", span }
    );
    assertEquals(
      LayoutSpecSchema.safeParse([row]).success,
      fillable(spans),
      JSON.stringify(spans),
    );
  }

  const refusal = (row: { block: string; span?: number }[]) =>
    LayoutSpecSchema.safeParse([row]).error?.issues.map((i) => i.message);
  const n = _GLOBAL_LAYOUT_COLUMNS;
  assertEquals(refusal([{ block: "a1b", span: 6 }]), [
    `A row with one cell spans all ${n} columns: omit its span.`,
  ]);
  assertEquals(
    refusal([{ block: "a1b", span: 4 }, { block: "c3d", span: 4 }]),
    [`Spans in row sum to 8, must sum to ${n}. Got: [4, 4]`],
  );
  const refused = AiSlideUpdateSchema.safeParse({
    type: "content",
    layoutChange: {
      layout: [
        [{ block: "a1b" }],
        [{ block: "c3d", span: n - 1 }, { block: "e5f" }, { block: "g7h" }],
      ],
    },
  });
  assertEquals(refused.error?.issues.map((i) => [i.path, i.message]), [[
    ["layoutChange", "layout", 1],
    `Specified spans sum to ${
      n - 1
    } of the row's ${n} columns, leaving 1 for 2 cell(s) without a span, which need at least 1 each.`,
  ]]);
});
