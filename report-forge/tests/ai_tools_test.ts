// Pins the AI entry (report-forge/ai): the pure text operations a model
// performs on a document, the checks a proposed body must pass, and the
// ready-made tools over a host. The messages are what a model reads and acts
// on, so they are asserted as text.
//
// Run: deno test -A report-forge/tests/ai_tools_test.ts

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  checkReportBodyLength,
  createReportTextTools,
  readReportText,
  replaceReportText,
  REPORT_BODY_MAX_LENGTH,
  type ReportEmbedIds,
  reportSkippedNote,
  type ReportTextEdit,
  type ReportTextTool,
  type ReportTextToolsHost,
  rewriteReportBody,
  rewriteReportSection,
} from "../ai/mod.ts";

const BODY = [
  "# Title",
  "",
  "intro",
  "",
  "## Findings",
  "",
  "first findings",
  "",
  "![Coverage](figure:f1)",
  "",
  "## Method",
  "",
  "the method",
  "",
  "## Findings",
  "",
  "second findings",
  "",
].join("\n");

const EMBEDS: ReportEmbedIds = { figures: ["f1"], images: ["i1"] };

function applied(edit: ReportTextEdit): { newBody: string; summary: string } {
  if (!edit.ok) throw new Error(`unexpected refusal: ${edit.error}`);
  return edit;
}
function refused(edit: ReportTextEdit): string {
  if (edit.ok) throw new Error("expected a refusal");
  return edit.error;
}

// ── Reading ──────────────────────────────────────────────────────────────────

Deno.test("read: body, headings index with section ranges, embeds, caret", () => {
  const read = readReportText(BODY, { embeds: EMBEDS });
  assertEquals(read.body, BODY);
  assertEquals(read.headings, [
    { level: 1, text: "Title", line: 1, sectionFromLine: 1, sectionToLine: 17 },
    {
      level: 2,
      text: "Findings",
      line: 5,
      sectionFromLine: 5,
      sectionToLine: 9,
    },
    {
      level: 2,
      text: "Method",
      line: 11,
      sectionFromLine: 11,
      sectionToLine: 13,
    },
    {
      level: 2,
      text: "Findings",
      line: 15,
      sectionFromLine: 15,
      sectionToLine: 17,
    },
  ]);
  assertEquals(read.selection, undefined);
  assertEquals(
    read.text,
    [
      "# REPORT EDITOR",
      "Format: FASTR Markdown — the theme supplies the design; never write CSS or a <style> block",
      "",
      "## Current body (FASTR Markdown)",
      BODY,
      "",
      "## Headings (section = what rewrite_section replaces; lines are 1-based)",
      "- line 1: # Title → section lines 1-17",
      "- line 5: ## Findings → section lines 5-9",
      "- line 11: ## Method → section lines 11-13",
      "- line 15: ## Findings → section lines 15-17",
      "",
      "## Figures: figure:f1",
      "## Images: image:i1",
      "## User's current selection: none (cursor at line 1)",
    ].join("\n"),
  );
});

Deno.test("read: a selection, a caret line, and a body with no headings", () => {
  const selected = readReportText(BODY, {
    selection: { empty: false, fromLine: 3, toLine: 3, text: "intro" },
  });
  assertEquals(selected.selection?.text, "intro");
  assertStringIncludes(
    selected.text,
    "## Images: none\n\n## User's current selection (lines 3-3)\nintro",
  );

  const caret = readReportText(BODY, {
    selection: { empty: true, fromLine: 7, toLine: 7, text: "" },
  });
  assertEquals(caret.selection, undefined);
  assertStringIncludes(
    caret.text,
    "## User's current selection: none (cursor at line 7)",
  );

  const flat = readReportText("just a paragraph\n");
  assertEquals(flat.headings, []);
  assertStringIncludes(flat.text, "## Headings: none\n\n## Figures: none\n");
});

Deno.test("read: a one-line section, and a host's own title and sections", () => {
  const read = readReportText("# Only\n", {
    title: "Annual review",
    headerLines: ["Template: Policy brief"],
    figureLines: ["## Figures (the host's own index):", "- figure:f1 · ANC1"],
    embeds: EMBEDS,
  });
  assertEquals(
    read.text,
    [
      "# REPORT EDITOR: Annual review",
      "Format: FASTR Markdown — the theme supplies the design; never write CSS or a <style> block",
      "Template: Policy brief",
      "",
      "## Current body (FASTR Markdown)",
      "# Only\n",
      "",
      "## Headings (section = what rewrite_section replaces; lines are 1-based)",
      "- line 1: # Only → section line 1",
      "",
      "## Figures (the host's own index):",
      "- figure:f1 · ANC1",
      "## Images: image:i1",
      "## User's current selection: none (cursor at line 1)",
    ].join("\n"),
  );
});

// ── Rewriting the whole body ─────────────────────────────────────────────────

Deno.test("rewrite body: replaces the body and collapses blank-line runs", () => {
  const edit = applied(
    rewriteReportBody(BODY, { body: "# New\n\n\n\nshort\n" }, EMBEDS),
  );
  assertEquals(edit.newBody, "# New\n\nshort\n");
  assertEquals(edit.summary, "Rewrite entire report");
});

Deno.test("rewrite body: an unclosed ::: fence is refused with its line", () => {
  assertEquals(
    refused(
      rewriteReportBody(
        BODY,
        { body: "# New\n\n:::callout\ncaveat\n" },
        EMBEDS,
      ),
    ),
    "The proposed body has 1 block problem:\n" +
      "line 3: Block `callout` is never closed with `:::`.\n" +
      "Every `:::` block except `stat`, `contents` and `report` must be closed by a bare `:::` line, and block names must be ones the format defines. Fix and re-propose.",
  );
});

Deno.test("rewrite body: an unknown embed id is refused, a known one passes", () => {
  assertEquals(
    refused(
      rewriteReportBody(BODY, {
        body: "# New\n\n![x](figure:nope)\n\n![y](image:gone)\n",
      }, EMBEDS),
    ),
    "Unresolved embed token(s): figure:nope, image:gone. Only reference figure/image ids that already exist (call get_report_editor to list them); do not invent ids.",
  );
  // An id is looked up among the ids given, never on an object's prototype.
  assertStringIncludes(
    refused(
      rewriteReportBody(BODY, { body: "![x](figure:constructor)\n" }, EMBEDS),
    ),
    "Unresolved embed token(s): figure:constructor.",
  );
  applied(
    rewriteReportBody(BODY, {
      body: "# New\n\n![x](figure:f1)\n\n![y](image:i1)\n",
    }, EMBEDS),
  );
});

Deno.test("rewrite body: an HTML embed token is refused with the right spelling", () => {
  assertEquals(
    refused(
      rewriteReportBody(
        BODY,
        { body: '# New\n\n<img src="figure:f1">\n' },
        EMBEDS,
      ),
    ),
    `This report's body is FASTR MARKDOWN, but the edit contains a HTML embed token ("<img src="figure:"). Write embed tokens as ![caption](figure:<id>) (one per line).`,
  );
});

Deno.test("rewrite body: an identical body is refused as unchanged", () => {
  const edit = rewriteReportBody(BODY, { body: BODY }, EMBEDS);
  assertEquals(edit, {
    ok: false,
    error:
      "The proposed body is IDENTICAL to the current body — nothing to review, so no accept/reject dialog was shown. Re-read with get_report_editor and propose an actual change.",
    unchanged: true,
  });
});

Deno.test("rewrite body: a long plain body needs blocks, or plain: true", () => {
  const plain = Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1}.`)
    .join("\n\n");
  assertStringIncludes(
    refused(rewriteReportBody(BODY, { body: plain }, EMBEDS)),
    "This is a FASTR Markdown report and the proposed body uses none of its blocks: it is a plain run of headings and paragraphs.",
  );
  applied(rewriteReportBody(BODY, { body: plain, plain: true }, EMBEDS));
  applied(
    rewriteReportBody(
      BODY,
      { body: `:::callout\nKey finding.\n:::\n\n${plain}` },
      EMBEDS,
    ),
  );
  // Eleven lines is a stub: nothing to design yet.
  applied(
    rewriteReportBody(BODY, {
      body: plain.split("\n\n").slice(1).join("\n\n"),
    }, EMBEDS),
  );
});

Deno.test("rewrite body: a stat nested in a card is refused", () => {
  assertEquals(
    refused(
      rewriteReportBody(BODY, {
        body: ':::tiles\n:::card\n:::stat{value="1" label="x"}\n:::\n:::\n',
      }, EMBEDS),
    ),
    "The proposed body nests 1 stat inside a card or column:\n" +
      "line 3: :::stat inside :::card\n" +
      "A stat is a tile of its own: put the stats DIRECTLY in a `:::tiles` row as bare `:::stat` lines (no `:::card` around them). Fix and re-propose.",
  );
});

Deno.test("rewrite body: a new literal colour is refused; an existing or allowed one passes", () => {
  const coloured = ":::callout{bg=#ff0000}\nNote.\n:::\n";
  assertEquals(
    refused(rewriteReportBody(BODY, { body: coloured }, EMBEDS)),
    "The proposal adds 1 literal colour:\n" +
      "line 1: bg=#ff0000\n" +
      "Literals do not follow a theme switch — for a ground use a tone (tone=paper|ink|accent|warm|cool) and for a phrase use a role ([x]{.danger} etc.), which each theme maps to its own palette. Only if the user explicitly asked for these exact colours, re-propose unchanged with allowLiteralColors: true.",
  );
  applied(
    rewriteReportBody(
      BODY,
      { body: coloured, allowLiteralColors: true },
      EMBEDS,
    ),
  );
  // The user already has that colour in the document: it is theirs to keep.
  applied(
    rewriteReportBody(
      `${BODY}\n${coloured}`,
      { body: `# New\n\n${coloured}` },
      EMBEDS,
    ),
  );
});

Deno.test("body length: over the cap is refused with both numbers", () => {
  assertEquals(
    checkReportBodyLength("x".repeat(REPORT_BODY_MAX_LENGTH)),
    undefined,
  );
  assertEquals(
    refused(
      rewriteReportBody(BODY, {
        body: "x".repeat(REPORT_BODY_MAX_LENGTH + 1),
        plain: true,
      }, EMBEDS),
    ),
    "Report body is too long (200001 chars; max 200000).",
  );
});

// ── Rewriting one section ────────────────────────────────────────────────────

Deno.test("rewrite section: replaces the heading's whole range", () => {
  const edit = applied(
    rewriteReportSection(BODY, {
      sectionHeading: "Method",
      newBody: "## Method\n\n\n\na better method\n",
    }, EMBEDS),
  );
  assertEquals(
    edit.newBody,
    BODY.replace(
      "## Method\n\nthe method\n\n",
      "## Method\n\na better method\n",
    ),
  );
  assertEquals(edit.summary, 'Rewrite section "Method"');
});

Deno.test("rewrite section: an unknown heading is refused", () => {
  assertEquals(
    refused(
      rewriteReportSection(BODY, {
        sectionHeading: "Appendix",
        newBody: "## Appendix\n\nx\n",
      }, EMBEDS),
    ),
    'No section with heading "Appendix" found. Call get_report_editor to see exact headings.',
  );
});

Deno.test("rewrite section: a repeated heading needs an occurrence index", () => {
  const args = {
    sectionHeading: "Findings",
    newBody: "## Findings\n\nrewritten\n",
  };
  assertEquals(
    refused(rewriteReportSection(BODY, args, EMBEDS)),
    'Multiple sections titled "Findings" (2). Provide occurrenceIndex (1-2).',
  );
  assertEquals(
    refused(
      rewriteReportSection(BODY, { ...args, occurrenceIndex: 3 }, EMBEDS),
    ),
    "occurrenceIndex 3 out of range (1-2).",
  );
  const second = applied(
    rewriteReportSection(BODY, { ...args, occurrenceIndex: 2 }, EMBEDS),
  );
  assertStringIncludes(second.newBody, "first findings");
  assert(!second.newBody.includes("second findings"));
  assert(second.newBody.endsWith("## Findings\n\nrewritten"));
});

Deno.test("rewrite section: the checks run on the whole resulting body", () => {
  // The fragment is balanced on its own count but leaves the document with a
  // block that runs to the end.
  assertStringIncludes(
    refused(
      rewriteReportSection(BODY, {
        sectionHeading: "Method",
        newBody: "## Method\n\n:::callout\ncaveat\n",
      }, EMBEDS),
    ),
    "The proposed body has 1 block problem:\nline 13: Block `callout` is never closed with `:::`.",
  );
  assertEquals(
    refused(
      rewriteReportSection(BODY, {
        sectionHeading: "Method",
        newBody: "## Method\n\n![x](figure:f2)\n",
      }, EMBEDS),
    ),
    "Unresolved embed token(s): figure:f2. Only reference figure/image ids that already exist (call get_report_editor to list them); do not invent ids.",
  );
  // Unlike a whole rewrite, a section may be plain however long it is.
  applied(
    rewriteReportSection(BODY, {
      sectionHeading: "Method",
      newBody: "## Method\n\n" +
        Array.from({ length: 14 }, (_, i) => `Step ${i + 1}.`).join("\n\n"),
    }, EMBEDS),
  );
});

Deno.test("rewrite section: the same section back is refused as unchanged", () => {
  const edit = rewriteReportSection("# Title\n\n## Method\n\nthe method", {
    sectionHeading: "Method",
    newBody: "## Method\n\nthe method\n",
  }, EMBEDS);
  assert(!edit.ok && edit.unchanged === true);
  assertStringIncludes(
    edit.error,
    "The proposed body is IDENTICAL to the current body",
  );
});

// ── Replacing text ───────────────────────────────────────────────────────────

Deno.test("replace text: one verbatim occurrence", () => {
  const edit = applied(
    replaceReportText(
      BODY,
      { oldText: "the method", newText: "our method" },
      EMBEDS,
    ),
  );
  assertEquals(edit.newBody, BODY.replace("the method", "our method"));
  assertEquals(edit.summary, "Replace text");
});

Deno.test("replace text: missing, empty and repeated text are refused", () => {
  assertEquals(
    refused(
      replaceReportText(BODY, { oldText: "absent", newText: "x" }, EMBEDS),
    ),
    "oldText was not found verbatim. Call get_report_editor to see the exact current text (whitespace and markup must match).",
  );
  assertEquals(
    refused(replaceReportText(BODY, { oldText: "", newText: "x" }, EMBEDS)),
    "oldText must not be empty.",
  );
  assertEquals(
    refused(
      replaceReportText(BODY, { oldText: "findings", newText: "x" }, EMBEDS),
    ),
    "oldText occurs 2 times. Provide occurrenceIndex (1-2), or include more surrounding text to make it unique.",
  );
  assertEquals(
    refused(
      replaceReportText(BODY, {
        oldText: "findings",
        newText: "x",
        occurrenceIndex: 5,
      }, EMBEDS),
    ),
    "occurrenceIndex 5 out of range (1-2).",
  );
  const second = applied(
    replaceReportText(BODY, {
      oldText: "findings",
      newText: "results",
      occurrenceIndex: 2,
    }, EMBEDS),
  );
  assertStringIncludes(second.newBody, "first findings");
  assertStringIncludes(second.newBody, "second results");
});

Deno.test("replace text: the result is checked, and no change is refused", () => {
  assertEquals(
    refused(
      replaceReportText(BODY, {
        oldText: "![Coverage](figure:f1)",
        newText: "![Coverage](figure:other)",
      }, EMBEDS),
    ),
    "Unresolved embed token(s): figure:other. Only reference figure/image ids that already exist (call get_report_editor to list them); do not invent ids.",
  );
  assertStringIncludes(
    refused(
      replaceReportText(
        BODY,
        { oldText: "intro", newText: ":::band\nintro" },
        EMBEDS,
      ),
    ),
    "line 3: Block `band` is never closed with `:::`.",
  );
  const same = replaceReportText(
    BODY,
    { oldText: "intro", newText: "intro" },
    EMBEDS,
  );
  assert(!same.ok && same.unchanged === true);
});

// ── After an accept ──────────────────────────────────────────────────────────

Deno.test("skipped note: empty when all applied, the line ranges otherwise", () => {
  assertEquals(reportSkippedNote(undefined), "");
  assertEquals(reportSkippedNote([]), "");
  assertEquals(
    reportSkippedNote([{ fromLine: 5, toLine: 5 }, {
      fromLine: 12,
      toLine: 14,
    }]),
    " NOTE: the proposed change(s) at line(s) 5, 12–14 were NOT applied — a collaborator edited that text while the proposal was open. Re-read the report (get_report_editor) before retrying those parts.",
  );
});

// ── The tools, over a fake host ──────────────────────────────────────────────

type Proposal = { newBody: string; summary: string };

// A host with a body in memory and a user who answers every proposal the
// same way; an accepted proposal becomes the body.
function fakeHost(
  decide: (p: Proposal) => {
    accepted: boolean;
    skipped?: { fromLine: number; toLine: number }[];
  },
  extra: Partial<ReportTextToolsHost> = {},
) {
  const state = { body: BODY, proposals: [] as Proposal[] };
  const host: ReportTextToolsHost = {
    getBody: () => state.body,
    proposeEdit: (proposal) => {
      state.proposals.push(proposal);
      const decision = decide(proposal);
      if (decision.accepted) state.body = proposal.newBody;
      return Promise.resolve(decision);
    },
    figureIds: () => EMBEDS.figures,
    imageIds: () => EMBEDS.images,
    ...extra,
  };
  return { host, state };
}

function tool(tools: ReportTextTool[], name: string): ReportTextTool {
  const found = tools.find((t) => t.name === name);
  if (!found) throw new Error(`no tool named ${name}`);
  return found;
}

Deno.test("tools: names, plain JSON schemas, and the pages tool only when the host can lay pages out", () => {
  const without = createReportTextTools(
    fakeHost(() => ({ accepted: true })).host,
  );
  assertEquals(without.map((t) => t.name), [
    "get_report_editor",
    "rewrite_report",
    "rewrite_section",
    "replace_text",
  ]);
  assert(
    !tool(without, "rewrite_report").description.includes(
      "lay the draft out with get_report_pages",
    ),
  );

  const withPages = createReportTextTools(
    fakeHost(() => ({ accepted: true }), { describePages: () => "" }).host,
  );
  assertEquals(withPages.map((t) => t.name), [
    "get_report_editor",
    "rewrite_report",
    "rewrite_section",
    "replace_text",
    "get_report_pages",
  ]);
  assertStringIncludes(
    tool(withPages, "rewrite_report").description,
    "lay the draft out with get_report_pages",
  );

  for (const t of withPages) {
    // A schema is data a model client can send as it is.
    assertEquals(JSON.parse(JSON.stringify(t.inputSchema)), t.inputSchema);
    assertEquals(t.inputSchema.type, "object");
    assertEquals(t.inputSchema.additionalProperties, false);
    for (const key of t.inputSchema.required) {
      assert(key in t.inputSchema.properties, `${t.name}: ${key}`);
    }
  }
  assertEquals(tool(withPages, "rewrite_section").inputSchema, {
    type: "object",
    properties: {
      sectionHeading: { type: "string" },
      newBody: { type: "string" },
      occurrenceIndex: { type: "integer", minimum: 1 },
      allowLiteralColors: {
        type: "boolean",
        description:
          "Set true ONLY when the user explicitly asked for specific literal colours, gradients or image backgrounds (bg=...). Without it, newly-added literal bg= values are rejected — use tones, which follow the theme.",
      },
    },
    required: ["sectionHeading", "newBody"],
    additionalProperties: false,
  });
  // The format guide rides the rewrite tool, as it does in the platform.
  assertStringIncludes(
    tool(withPages, "rewrite_report").description,
    ":::cover",
  );
});

Deno.test("tools: get_report_editor reads the live body and selection", async () => {
  const { host, state } = fakeHost(() => ({ accepted: true }), {
    getSelection: () => ({
      empty: false,
      fromLine: 13,
      toLine: 13,
      text: "the method",
    }),
  });
  const read = tool(createReportTextTools(host), "get_report_editor");
  const first = await read.run({});
  assertStringIncludes(first, "## Current body (FASTR Markdown)\n# Title\n");
  assertStringIncludes(first, "- line 11: ## Method → section lines 11-13");
  assertStringIncludes(first, "## Figures: figure:f1\n## Images: image:i1\n");
  assertStringIncludes(
    first,
    "## User's current selection (lines 13-13)\nthe method",
  );
  state.body = "# Changed\n";
  assertStringIncludes(
    await read.run({}),
    "- line 1: # Changed → section line 1",
  );
});

Deno.test("tools: an accepted proposal is applied and the model is told so", async () => {
  const { host, state } = fakeHost(() => ({ accepted: true, skipped: [] }));
  const tools = createReportTextTools(host);

  assertEquals(
    await tool(tools, "replace_text").run({
      oldText: "the method",
      newText: "our method",
    }),
    "The user ACCEPTED the edit; it is now applied to the report.",
  );
  assertEquals(state.proposals.at(-1), {
    newBody: BODY.replace("the method", "our method"),
    summary: "Replace text",
  });
  assertStringIncludes(state.body, "our method");

  assertEquals(
    await tool(tools, "rewrite_section").run({
      sectionHeading: "Method",
      newBody: "## Method\n\nrewritten\n",
    }),
    'The user ACCEPTED the rewrite of section "Method"; it is now applied.',
  );
  assertEquals(state.proposals.at(-1)?.summary, 'Rewrite section "Method"');
  assertStringIncludes(state.body, "## Method\n\nrewritten\n## Findings");

  assertEquals(
    await tool(tools, "rewrite_report").run({ body: "# Fresh\n\nstart\n" }),
    "The user ACCEPTED the rewrite; it is now applied to the report.",
  );
  assertEquals(state.body, "# Fresh\n\nstart\n");
  assertEquals(state.proposals.length, 3);
});

Deno.test("tools: a rejected proposal changes nothing and the model is told so", async () => {
  const { host, state } = fakeHost(() => ({ accepted: false }));
  const tools = createReportTextTools(host);

  assertEquals(
    await tool(tools, "rewrite_report").run({ body: "# Fresh\n\nstart\n" }),
    "The user REJECTED the rewrite; nothing was applied. Do not propose it again unless the user asks.",
  );
  assertEquals(
    await tool(tools, "rewrite_section").run({
      sectionHeading: "Method",
      newBody: "## Method\n\nrewritten\n",
    }),
    'The user REJECTED the rewrite of section "Method"; nothing was applied. Do not propose it again unless the user asks.',
  );
  assertEquals(
    await tool(tools, "replace_text").run({
      oldText: "the method",
      newText: "our method",
    }),
    "The user REJECTED the edit; nothing was applied. Do not propose it again unless the user asks.",
  );
  assertEquals(state.proposals.length, 3);
  assertEquals(state.body, BODY);
});

Deno.test("tools: an accept that skipped lines says which", async () => {
  const { host } = fakeHost(() => ({
    accepted: true,
    skipped: [{ fromLine: 3, toLine: 4 }],
  }));
  assertEquals(
    await tool(createReportTextTools(host), "rewrite_report").run({
      body: "# Fresh\n\nstart\n",
    }),
    "The user ACCEPTED the rewrite; it is now applied to the report." +
      " NOTE: the proposed change(s) at line(s) 3–4 were NOT applied — a collaborator edited that text while the proposal was open. Re-read the report (get_report_editor) before retrying those parts.",
  );
});

Deno.test("tools: a refused edit never reaches the user", async () => {
  const { host, state } = fakeHost(() => ({ accepted: true }));
  const tools = createReportTextTools(host);

  assertEquals(
    await tool(tools, "rewrite_section").run({
      sectionHeading: "Appendix",
      newBody: "## Appendix\n",
    }),
    'No section with heading "Appendix" found. Call get_report_editor to see exact headings.',
  );
  assertEquals(
    await tool(tools, "rewrite_section").run({
      sectionHeading: "Findings",
      newBody: "## Findings\n\nx\n",
    }),
    'Multiple sections titled "Findings" (2). Provide occurrenceIndex (1-2).',
  );
  assertStringIncludes(
    await tool(tools, "rewrite_report").run({ body: "# T\n\n:::callout\nx\n" }),
    "line 3: Block `callout` is never closed with `:::`.",
  );
  assertStringIncludes(
    await tool(tools, "rewrite_report").run({ body: "![x](figure:nope)\n" }),
    "Unresolved embed token(s): figure:nope.",
  );
  assertStringIncludes(
    await tool(tools, "rewrite_report").run({ body: BODY }),
    "The proposed body is IDENTICAL to the current body",
  );
  assertEquals(state.proposals, []);
  assertEquals(state.body, BODY);
});

Deno.test("tools: without embed ids from the host, every embed is unknown", async () => {
  const { host } = fakeHost(() => ({ accepted: true }), {
    figureIds: undefined,
    imageIds: undefined,
  });
  assertStringIncludes(
    await tool(createReportTextTools(host), "replace_text").run({
      oldText: "intro",
      newText: "![x](image:i1)",
    }),
    "Unresolved embed token(s): image:i1, figure:f1.",
  );
});

Deno.test("tools: a wrongly shaped input comes back as text for the model", async () => {
  const { host, state } = fakeHost(() => ({ accepted: true }));
  const tools = createReportTextTools(host);
  assertEquals(
    await tool(tools, "replace_text").run({ oldText: "intro" }),
    'Invalid input for replace_text: "newText" is required and must be a string.',
  );
  assertEquals(
    await tool(tools, "rewrite_section").run({
      sectionHeading: "Findings",
      newBody: "## Findings\n",
      occurrenceIndex: 0,
    }),
    'Invalid input for rewrite_section: "occurrenceIndex" must be a whole number, 1 or more.',
  );
  assertEquals(
    await tool(tools, "rewrite_report").run({ body: "# T\n", plain: "yes" }),
    'Invalid input for rewrite_report: "plain" must be true or false.',
  );
  assertEquals(
    await tool(tools, "rewrite_report").run(null),
    "Invalid input for rewrite_report: the input must be an object.",
  );
  assertEquals(state.proposals, []);
});

Deno.test("tools: get_report_pages lays out the live body, or a draft with its blank runs collapsed", async () => {
  const seen: string[] = [];
  const { host } = fakeHost(() => ({ accepted: true }), {
    describePages: (body) => {
      seen.push(body);
      return Promise.resolve(`pages of ${body.length} chars`);
    },
  });
  const pages = tool(createReportTextTools(host), "get_report_pages");
  assertEquals(await pages.run({}), `pages of ${BODY.length} chars`);
  assertEquals(
    await pages.run({ markdown: "# Draft\n\n\n\nx\n" }),
    "pages of 11 chars",
  );
  assertEquals(seen, [BODY, "# Draft\n\nx\n"]);
});
