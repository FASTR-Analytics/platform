// Pins what the chat tells the model under append-only turns: the system
// prompt is instance level, with no date and no tool catalogue, which only
// /mcp's one-shot get_overview asks for; the FASTR brief rides
// rewrite_report's description alone; and the package block names the
// package, the scope and each family's limits.
//
//   deno test -A --no-check server/tests/copilot_prompt_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import type { RunDataset, ScopeDefinition } from "lib";
import {
  buildPackageBlock,
  buildSystemPrompt,
  FASTR_MD_SYNTAX_DOC,
  getEditingReportInstructions,
} from "lib";

const PARTS = {
  contextSection: "# Instance Information\n\n**Instance:** Test\n\n---\n\n",
  infoTopics: [],
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

Deno.test("the FASTR editing instructions do not carry the syntax doc", () => {
  const instructions = getEditingReportInstructions(
    "Quarterly review",
    "fastr",
  );
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
    },
  });
  assertStringIncludes(
    block,
    "**Package:** 00000000-0000-4000-8000-000000000000\n**Scope:** not listed",
  );
  assert(!block.includes("generated"));
});
