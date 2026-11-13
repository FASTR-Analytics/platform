// Pins the copilot's slide schemas to the stored ones: every stored field of a
// slide type is one the copilot can create and update, unless it is named
// below with the reason it is left out.
//
//   deno test -A --no-check server/tests/ai_slide_schema_test.ts

import { assertEquals } from "@std/assert";
import {
  AiContentSlideSchema,
  AiCoverSlideSchema,
  AiSectionSlideSchema,
  AiSlideUpdateSchema,
  AiTextBlockSchema,
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
