// Pins what the chat tells the model under append-only turns: the system
// prompt is instance level, with no date and no tool catalogue, which only
// /mcp's one-shot get_overview asks for; the chat's own principles, which
// /mcp does not pass; the deck brief's rule for when a slide is read; the
// FASTR brief rides rewrite_report's description alone; and the package
// block names the package, the scope and each family's limits.
//
//   deno test -A --no-check server/tests/copilot_prompt_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type { RunDataset, ScopeDefinition } from "lib";
import {
  buildMapCoverageLines,
  buildPackageBlock,
  buildSystemPrompt,
  CHAT_CORE_PRINCIPLES,
  FASTR_MD_SYNTAX_DOC,
  FIGURE_EDITOR_LOOK_LINE,
  getEditingReportInstructions,
  getEditingSlideDeckInstructions,
} from "lib";
import { IMAGE_LIMITS } from "@timroberton/panther";

const PARTS = {
  contextSection: "# Instance Information\n\n**Instance:** Test\n\n---\n\n",
  roleAndPurpose: "You are the test assistant.",
  extraCorePrinciples: [],
};

Deno.test("the chat's system prompt carries no date and no tool catalogue", () => {
  const prompt = buildSystemPrompt(PARTS);
  assert(!prompt.includes("CURRENT DATE"));
  assert(!prompt.includes("# Available Tools"));
  assert(prompt.startsWith(PARTS.contextSection));
  assertStringIncludes(
    prompt,
    "# Role and Purpose\n\nYou are the test assistant.",
  );
});

Deno.test("the system prompt points at the reference tools and names no document", () => {
  const prompt = buildSystemPrompt(PARTS);
  assertStringIncludes(
    prompt,
    "# Reference documentation\n\nAuthoritative reference documents (the app's own and the FASTR methodology hub's chapters) are listed by get_reference_docs and read by get_reference_doc.",
  );
  assert(!prompt.includes("iceh"));
});

// The three shapes a run of the testing script caught the copilot writing:
// a superlative read off the rows it noticed rather than all of them, a series
// described as a steady rise through a year it fell, and a change narrated from
// a state no tool result reported. The rule lives in the shared base, so every
// view and /mcp inherit it from one edit.
Deno.test("every prompt states the standard a written claim must meet", () => {
  const prompt = buildSystemPrompt(PARTS);
  assertStringIncludes(
    prompt,
    "**Check every claim against the rows you were given, before you write it**",
  );
  // A comparative or superlative is about every row returned.
  assertStringIncludes(prompt, "about EVERY row you were returned");
  assertStringIncludes(prompt, "name the row that actually wins");
  assertStringIncludes(prompt, "a dip or a plateau in the middle is stated");
  // A threshold band is checked against its own cutoffs, not against rows.
  assertStringIncludes(
    prompt,
    "checked against the band's own cutoffs, printed with their operators in the Dimension Summary",
  );
  assertStringIncludes(
    prompt,
    "a value already inside the band is in it, not approaching it",
  );
  // A partial period is labelled partial wherever it is used.
  assertStringIncludes(
    prompt,
    'A period the "Period coverage" line shows ending short of its unit is partial',
  );
  assertStringIncludes(prompt, "never as a finished period");
  // A change is described only as the tool result reports it.
  assertStringIncludes(
    prompt,
    "describe a change to a product only as the tool result reports it",
  );
  assertStringIncludes(
    prompt,
    "never offer to restore a state no tool result shows",
  );
  // It is in the shared base, not an extra principle a view passes in, so it
  // survives a view that passes none.
  assertEquals(PARTS.extraCorePrinciples.length, 0);
});

Deno.test("buildSystemPrompt keeps the date and the catalogue when asked, as get_overview asks", () => {
  const prompt = buildSystemPrompt({
    ...PARTS,
    currentDate: "2026-10-12",
    toolCatalog: "- get_overview: the overview",
  });
  assert(
    prompt.startsWith(
      `**CURRENT DATE: 2026-10-12**\n\n---\n\n${PARTS.contextSection}`,
    ),
  );
  assert(
    prompt.endsWith("\n# Available Tools\n\n- get_overview: the overview\n"),
  );
});

// A turn has a limited number of replies, and the chat's loop runs every call
// of one reply before it asks the model again. /mcp's clients run their own
// loop, so the principle is the chat's and not the shared base's.
Deno.test("the chat's principles put independent calls in one reply, and a prompt given no extra principles does not", () => {
  const chat = buildSystemPrompt({
    ...PARTS,
    extraCorePrinciples: CHAT_CORE_PRINCIPLES,
  });
  assertStringIncludes(chat, "6. **Ask when uncertain**");
  assertStringIncludes(
    chat,
    "7. **Put calls that do not depend on each other in one reply** - A reply can hold several tool calls: they run in order and each returns its own result.",
  );
  assertStringIncludes(
    chat,
    "A call that needs another's result (a new slide's ID, a block ID) waits for that result.",
  );

  const bare = buildSystemPrompt(PARTS);
  assert(!bare.includes("in one reply"));
  assert(!bare.includes("Ask when uncertain"));
});

Deno.test("the deck brief lists the image block beside text and from_metric", () => {
  const brief = getEditingSlideDeckInstructions("Round 1 report");
  assertStringIncludes(brief, '**Text (markdown):** { "type": "text"');
  assertStringIncludes(brief, '**From metric:** { "type": "from_metric"');
  assertStringIncludes(
    brief,
    '**Image:** { "type": "image", "imgFile": "...", "style": { "imgFit": "contain", "imgAlign": "center" } }, where imgFile is one of the instance\'s image assets, listed by get_image_assets',
  );
});

Deno.test("the deck brief names a slide's settings, where they are read and how they are set", () => {
  const brief = getEditingSlideDeckInstructions("Round 1 report");
  assertStringIncludes(
    brief,
    "Each slide also has its own settings: a cover's and a section's text sizes, bold and italic, a cover's logos, and a content slide's sub-header, date, footer, header and footer logos and side panel (split). get_slides shows them as stored, and update_slide sets them.",
  );
  assertStringIncludes(
    brief,
    "**Change text, settings, blocks or layout** (a cover's or section's fields, a content slide's header, a slide's settings,",
  );
});

// One read per slide per turn: the read at the start of a turn stays, since a
// collaborator's edit can land between two messages, and every read after a
// write goes, since the write's result states what it left.
Deno.test("the deck brief reads a slide once a turn and takes a write's result as the slide's state", () => {
  const brief = getEditingSlideDeckInstructions("Round 1 report");
  assert(
    brief.startsWith(
      '# Current View: Editing slide deck\n\nYou\'re editing the slide deck "Round 1 report".',
    ),
  );
  assertStringIncludes(
    brief,
    "Read a slide with get_slides before your first change to it after a user message, and ask for every slide you need in one call.",
  );
  assertStringIncludes(
    brief,
    "Until the user's next message, the result of your own write to a slide (creating it included) is its state.",
  );
  assertStringIncludes(
    brief,
    "Never read a slide to confirm a write or to learn its block IDs",
  );
  assertStringIncludes(
    brief,
    "The exception is a copy made by duplicate_slides, whose result gives only the new slide IDs: read the copy with get_slides before your first change to it",
  );
  assertStringIncludes(
    brief,
    "A write's result carries what the write left: the slide's block IDs, its layout, its page fit and the config of each figure the write built or changed.",
  );
  assert(!brief.includes("before changing any slide"));
});

// Panther holds a tool's image for the turn that took it, so the brief says
// when to look, that the image is gone after the turn, and the turn's cap.
Deno.test("the deck brief says when to look at a slide and that an image lasts one turn", () => {
  const brief = getEditingSlideDeckInstructions("Round 1 report");
  assertStringIncludes(
    brief,
    "Look at a slide with get_slide_images after building or restructuring one that holds a dense table or several blocks",
  );
  assertStringIncludes(
    brief,
    `You see an image for the rest of the turn and not after: say in your reply what it showed, look again with one call to see the slide as it is then, and take at most ${IMAGE_LIMITS.MAX_PER_TURN} images in a turn`,
  );
  assert(!brief.includes("sent again with every later request"));
  assert(!brief.includes("never look at every slide of a deck"));
});

Deno.test("the report brief says when to look at a figure and that an image lasts one turn", () => {
  const brief = getEditingReportInstructions("Round 1 report");
  assertStringIncludes(
    brief,
    "Look at a figure with get_report_figure_images after inserting or changing one whose legibility its configuration cannot tell (a dense table, many series, long labels)",
  );
  assertStringIncludes(
    brief,
    `You see an image for the rest of the turn and not after: say in your reply what it showed, look again with one call to see the figure as it is then, and take at most ${IMAGE_LIMITS.MAX_PER_TURN} images in a turn.`,
  );
});

Deno.test("the FASTR editing instructions do not carry the syntax doc", () => {
  const instructions = getEditingReportInstructions("Quarterly review");
  assert(!instructions.includes(FASTR_MD_SYNTAX_DOC));
  assertStringIncludes(instructions, "rewrite_report's description");
  assertStringIncludes(
    instructions,
    '# Current View: Editing Report "Quarterly review" (FASTR Markdown format)',
  );
});

const DEFINITION: ScopeDefinition = {
  hmis: {
    include: true,
    adminArea2: "Kano",
    years: { start: 2022, end: 2024 },
    modules: null,
    indicators: ["anc1", "anc4"],
  },
  hfa: { include: false },
  iceh: { include: true, years: null, modules: null, indicators: null },
};

const HMIS_DATASET: RunDataset = {
  datasetType: "hmis",
  info: {
    version: {
      id: 3,
      nRowsTotalImported: 0,
      nRowsInserted: undefined,
      nRowsUpdated: undefined,
      stagingResult: undefined,
    },
  },
  dateExported: "2026-01-01T00:00:00.000Z",
};

Deno.test("the package block names the package, the scope and each family's limits", () => {
  const block = buildPackageBlock({
    packageLabel: "National package 2026-Q2",
    createdAt: "2026-08-19T10:00:00.000Z",
    scope: { label: "Kano", definition: DEFINITION },
    grounding: {
      calendar: "gregorian",
      datasets: [HMIS_DATASET],
      hmisIndicators: [],
      icehIndicators: [{ id: "iceh_anc", label: "ANC coverage (survey)" }],
      mapLevels: [{
        family: "hmis",
        adminAreaLevel: 2,
        uploadedAt: "2026-10-01T00:00:00.000Z",
      }],
    },
  });
  const lines = block.split("\n");
  assertEquals(lines[0], "# Results package in view");
  assertStringIncludes(
    block,
    "**Package:** National package 2026-Q2 (generated 2026-08-19T10:00:00.000Z)",
  );
  assertStringIncludes(block, "**Scope:** Kano");
  assertStringIncludes(
    block,
    '- HMIS: included, limited to admin area 2 "Kano"; years 2022 to 2024; indicators anc1, anc4.',
  );
  assertStringIncludes(block, "- HFA: excluded.");
  assertStringIncludes(block, "- ICEH: included, no limits.");
  assertStringIncludes(block, "**Calendar:** gregorian");
  assertStringIncludes(
    block,
    "- Boundary map files exist for HMIS at admin_area_2",
  );
  assertStringIncludes(block, "- HMIS data (version 3)");
  assertStringIncludes(block, "- iceh_anc: ANC coverage (survey)");
  assert(
    lines.indexOf(
      '- HMIS: included, limited to admin area 2 "Kano"; years 2022 to 2024; indicators anc1, anc4.',
    ) <
      lines.indexOf(
        "- HFA: excluded. Every HFA table reads as empty and no HFA module or metric is offered.",
      ),
  );
});

Deno.test("the package block says when the scope is not listed", () => {
  const block = buildPackageBlock({
    packageLabel: "00000000-0000-4000-8000-000000000000",
    createdAt: null,
    scope: undefined,
    grounding: {
      calendar: "ethiopian",
      datasets: [],
      hmisIndicators: [],
      icehIndicators: [],
      mapLevels: [],
    },
  });
  assertStringIncludes(
    block,
    "**Package:** 00000000-0000-4000-8000-000000000000\n**Scope:** not listed",
  );
  assert(!block.includes("generated"));
});

Deno.test("the map coverage line names each registry's levels, or says there are none", () => {
  assertEquals(
    buildMapCoverageLines([
      { family: "hfa", adminAreaLevel: 4, uploadedAt: "2026-06-10" },
      { family: "hmis", adminAreaLevel: 4, uploadedAt: "2026-10-26" },
      { family: "hmis", adminAreaLevel: 3, uploadedAt: "2026-10-26" },
    ]),
    [
      "- Boundary map files exist for HMIS at admin_area_3, admin_area_4; HFA at admin_area_4. A map figure renders only at those levels for that registry; at any other level use a table.",
    ],
  );
  assertEquals(buildMapCoverageLines([]), [
    "- This results package has no boundary map files, so no map figure can render: use tables.",
  ]);
});

Deno.test("the report's starting brief does not name the turn cap", () => {
  const brief = getEditingReportInstructions("Q3", { untouched: true });
  assertStringIncludes(
    brief,
    "A turn has a limited number of replies (counting the user's answers to your questions)",
  );
});

// The figure editor's brief is built in the client from this line, which the
// test reads from the client's source because the client is not importable
// here.
Deno.test("the figure editor brief says when to look at the figure and that an image lasts one turn", () => {
  assertStringIncludes(
    FIGURE_EDITOR_LOOK_LINE,
    "Look at the figure with get_figure_editor_image after changing its chart type, its display slots or its disaggregations",
  );
  assertStringIncludes(
    FIGURE_EDITOR_LOOK_LINE,
    `You see an image for the rest of the turn and not after: say in your reply what it showed, look again with one call to see the figure as it is then, and take at most ${IMAGE_LIMITS.MAX_PER_TURN} images in a turn.`,
  );
  const client = Deno.readTextFileSync(
    new URL(
      "../../client/src/components/instance/copilot/build_system_prompt.ts",
      import.meta.url,
    ),
  );
  assert(
    /const FIGURE_EDITOR_TOOLS_LINES =\s*`[^`]*\$\{FIGURE_EDITOR_LOOK_LINE\}`/
      .test(client),
    "the client's figure editor brief no longer carries FIGURE_EDITOR_LOOK_LINE",
  );
});
