// Pins the copilot's slide schemas to the stored ones: every stored field of a
// slide type is one the copilot can create and update, unless it is named
// below with the reason it is left out. Pins what replace_slide keeps.
//
//   deno test -A --no-check server/tests/ai_slide_schema_test.ts

import { assertEquals } from "@std/assert";
import {
  AiContentSlideSchema,
  AiCoverSlideSchema,
  AiSectionSlideSchema,
  AiSlideUpdateSchema,
  AiTextBlockSchema,
  type ContentSlide,
  type CoverSlide,
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
