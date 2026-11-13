// A look shows the model what its twin reads and what the user sees only
// while both read their subject through the same function and the look draws
// through the function the user's screen draws through. Nothing else fails
// when one of them stops, so this reads the sources.
//
//   deno test -A --no-check server/tests/copilot_look_sources_test.ts

import { assert } from "@std/assert";

const ROOT = new URL("../../", import.meta.url);
const TOOLS = "client/src/components/products/copilot/ai_tools/tools/";
const SLIDE_AI = "client/src/components/products/copilot/slide_ai/";

function source(path: string): string {
  return Deno.readTextFileSync(new URL(path, ROOT));
}

function calls(text: string, fn: string): boolean {
  return new RegExp(`\\b${fn}\\(`).test(text);
}

// The text of a top-level function, from its declaration to the first line
// that closes it.
function functionBody(text: string, name: string): string {
  const start = text.search(
    new RegExp(`\\nexport (async )?function ${name}\\(`),
  );
  assert(start >= 0, `no function ${name}`);
  const end = text.indexOf("\n}\n", start);
  return text.slice(start, end < 0 ? undefined : end);
}

function assertCalls(path: string, text: string, fn: string): void {
  assert(calls(text, fn), `${path} no longer calls ${fn}`);
}

Deno.test("get_slides and get_slide_images read slides through the same functions", () => {
  for (const file of ["get_slides.ts", "get_slide_images.ts"]) {
    const path = TOOLS + file;
    const text = source(path);
    assertCalls(path, text, "readSlideTarget");
    assertCalls(path, text, "assertSlidesInDeck");
    assertCalls(path, text, "getDeckConfig");
  }
});

Deno.test("the slide look draws the page the editor canvas and the PDF draw", () => {
  const renderPath = SLIDE_AI + "render_slide_image.ts";
  assertCalls(renderPath, source(renderPath), "buildSlidePage");
  const pagePath = SLIDE_AI + "measure_slide_overflow.ts";
  assertCalls(
    `buildSlidePage in ${pagePath}`,
    functionBody(source(pagePath), "buildSlidePage"),
    "convertSlideToPageInputs",
  );
  const canvasPath =
    "client/src/components/products/slide_deck/slide_editor/slide_editor.tsx";
  assertCalls(canvasPath, source(canvasPath), "convertSlideToPageInputs");
});
