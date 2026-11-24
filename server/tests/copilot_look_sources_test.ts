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
  return new RegExp(`\\b${fn.replaceAll(".", "\\.")}\\(`).test(text);
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

// The text from a marker to the first `end` after it.
function segment(text: string, marker: string, end: string): string {
  const start = text.indexOf(marker);
  assert(start >= 0, `no ${marker}`);
  const stop = text.indexOf(end, start + marker.length);
  return text.slice(start, stop < 0 ? undefined : stop);
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
  assertCalls(
    `buildSlidePage in ${pagePath}`,
    functionBody(source(pagePath), "buildSlidePage"),
    "getFontsForPage",
  );
  const canvasPath =
    "client/src/components/products/slide_deck/slide_editor/slide_editor.tsx";
  assertCalls(canvasPath, source(canvasPath), "convertSlideToPageInputs");
});

// Panther's own error for text it cannot draw names functions the model
// cannot call, so every measure and look refuses that text first, in the
// model's terms, naming the block, and the editor canvas in the user's.
Deno.test("a slide whose text panther cannot draw is refused before its page is built", () => {
  // The text of a function before it builds the page.
  const beforePage = (where: string, body: string) => {
    const at = body.indexOf("convertSlideToPageInputs(");
    assert(at >= 0, `${where} no longer builds the page`);
    return body.slice(0, at);
  };
  const pagePath = SLIDE_AI + "measure_slide_overflow.ts";
  const pageWhere = `buildSlidePage in ${pagePath}`;
  const page = beforePage(
    pageWhere,
    functionBody(source(pagePath), "buildSlidePage"),
  );
  assertCalls(pageWhere, page, "describeUndrawableTextBlock");
  assert(
    page.includes("if (undrawable !== undefined) throw new Error(undrawable);"),
    `${pageWhere} no longer refuses the text it finds before building the page`,
  );
  const canvasPath =
    "client/src/components/products/slide_deck/slide_editor/slide_editor.tsx";
  const canvasWhere = `attemptGetPageInputs in ${canvasPath}`;
  const canvas = beforePage(
    canvasWhere,
    segment(
      source(canvasPath),
      "async function attemptGetPageInputs(",
      "\n  }\n",
    ),
  );
  assertCalls(canvasWhere, canvas, "findUndrawableSlideTextBlock");
  const refusal = segment(canvas, "if (undrawable !== undefined) {", "\n    }");
  for (const part of ["setPageInputs(", 'status: "error"', "return;"]) {
    assert(
      refusal.includes(part),
      `${canvasWhere} no longer shows its own error and stops before building the page`,
    );
  }
});

// A text block the model writes is refused when slide text cannot draw it,
// wherever a tool takes one.
Deno.test("every slide write that takes a text block refuses a table or an image in it", () => {
  for (
    const [where, body] of [
      [
        `validateAiSlideInput in ${TOOLS}slides.tsx`,
        segment(
          source(TOOLS + "slides.tsx"),
          "function validateAiSlideInput(",
          "\n}\n",
        ),
      ],
      [
        `applySlideUpdate in ${TOOLS}update_slide.ts`,
        segment(
          source(TOOLS + "update_slide.ts"),
          "async function applySlideUpdate(",
          "\n}\n",
        ),
      ],
      [
        `resolveLayoutSpec in ${TOOLS}update_slide.ts`,
        segment(
          source(TOOLS + "update_slide.ts"),
          "async function resolveLayoutSpec(",
          "\n}\n",
        ),
      ],
      [`${TOOLS}drafts.tsx`, source(TOOLS + "drafts.tsx")],
    ]
  ) {
    assertCalls(where, body, "validateTextOnlyMarkdown");
  }
});

// The model is told a slide overflows the page in one sentence whichever tool
// reports the slide, so no tool may word it itself.
Deno.test("every slide tool states page overflow through describeSlideOverflow", () => {
  for (
    const path of [
      TOOLS + "slide_write_result.ts",
      TOOLS + "drafts.tsx",
      TOOLS + "get_slide_images.ts",
      SLIDE_AI + "get_deck_summary.ts",
      SLIDE_AI + "simplify_slide_for_ai.ts",
    ]
  ) {
    assertCalls(path, source(path), "describeSlideOverflow");
  }
  // It says what does not fit, by the causes the page's measurement gives,
  // in the slide fields the model writes with.
  const pagePath = SLIDE_AI + "measure_slide_overflow.ts";
  const describe = functionBody(source(pagePath), "describeSlideOverflow");
  for (const fn of ["describeSlideOverflowForAI", "slideTextField"]) {
    assertCalls(`describeSlideOverflow in ${pagePath}`, describe, fn);
  }
});

// The model cannot see the canvas badge, so the overflow it is told must be
// the badge's measurement, never the layout optimizer's score.
Deno.test("every overflow the model is told comes from the page measurement", () => {
  const writePath = TOOLS + "slide_write_result.ts";
  assertCalls(
    `prepareSlideWriteResult in ${writePath}`,
    functionBody(source(writePath), "prepareSlideWriteResult"),
    "measureSlideOverflow",
  );
  for (
    const path of [
      TOOLS + "drafts.tsx",
      SLIDE_AI + "get_deck_summary.ts",
      SLIDE_AI + "simplify_slide_for_ai.ts",
    ]
  ) {
    assertCalls(path, source(path), "measureSlideOverflow");
  }
  const renderPath = SLIDE_AI + "render_slide_image.ts";
  assertCalls(renderPath, source(renderPath), "PageRenderer.measure");
  // Where the page overflows comes with whether it does, for every measure.
  const pagePath = SLIDE_AI + "measure_slide_overflow.ts";
  assertCalls(
    `measureSlideOverflow in ${pagePath}`,
    functionBody(source(pagePath), "measureSlideOverflow"),
    "slidePageOverflow",
  );
  assertCalls(renderPath, source(renderPath), "slidePageOverflow");
});

Deno.test("get_report_figure and get_report_figure_images find a figure through the same function", () => {
  const editorPath = TOOLS + "report_editor.ts";
  assertCalls(
    `get_report_figure in ${editorPath}`,
    segment(
      source(editorPath),
      '...copilotToolContract("get_report_figure"),',
      "createAITool(",
    ),
    "liveBundleOrRefuse",
  );
  const lookPath = TOOLS + "get_report_figure_images.ts";
  const look = source(lookPath);
  assertCalls(lookPath, look, "liveBundleOrRefuse");
  assertCalls(lookPath, look, "getFigureLook");
});

Deno.test("the report's embed and its view context draw a figure through one builder", () => {
  const embedPath =
    "client/src/components/products/_shared/report_figure_embed.tsx";
  assertCalls(
    `ReportFigureEmbed in ${embedPath}`,
    functionBody(source(embedPath), "ReportFigureEmbed"),
    "buildReportFigureInputs",
  );
  const reportPath = "client/src/components/products/report/report.tsx";
  assertCalls(
    `getFigureLook in ${reportPath}`,
    segment(source(reportPath), "getFigureLook:", "\n        },"),
    "buildReportFigureInputs",
  );
});

Deno.test("get_figure_editor_image draws the editor's preview through the context's getter", () => {
  const lookPath = TOOLS + "get_figure_editor_image.ts";
  assertCalls(lookPath, source(lookPath), "getPreview");
  const editorPath =
    "client/src/components/_shared/figure_editor/figure_editor.tsx";
  const editor = source(editorPath);
  assert(
    /getPreview: \(\) => preview\(\)/.test(editor),
    `${editorPath} no longer gives the context the preview memo`,
  );
  assert(
    /<Show\s+when=\{previewState\(\)\}/.test(editor),
    `${editorPath} no longer draws the preview from the preview memo`,
  );
  assertCalls(
    `previewState in ${editorPath}`,
    segment(editor, "const previewState = ", "\n  };"),
    "preview",
  );
});
