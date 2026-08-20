import {
  buildDataCoverageSections,
  buildInstanceContextSections,
  buildPackageGroundingSections,
  buildSystemPrompt,
  type InstanceState,
  MAX_CONTENT_BLOCKS,
  SLIDE_TEXT_TOTAL_WORD_COUNT_MAX,
  SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET,
} from "lib";
import { SPA_INFO_TOPICS } from "./ai_tools/client_info_topics";
import {
  copilotAuthoringContext,
  describeCopilotPackage,
  describeCopilotScope,
} from "./authoring_context";

// The copilot's system prompt: the shared grounding blocks (lib/ai_tools/
// build_system_prompt.ts) plus the instance's own prose — the results package
// the copilot is currently serving, the product counts, and the instance-level
// `ai_context` (D15).
//
// BYTE-STABLE across navigation WITHIN one package: no view/mode argument —
// per-view instructions ride each view's instructions in ai_views.ts as a
// per-turn ephemeral section. Opening a product on a DIFFERENT package
// legitimately rewrites the package-grounding half and busts the prompt-cache
// breakpoint once; that is the price of grounding the model in the package it
// is actually reading, and the per-result source header (ai_tools/
// source_header.ts) carries the same fact into the transcript.
export function buildSystemPromptForContext(
  instance: InstanceState,
  toolCatalog: string,
): string {
  const pkg = describeCopilotPackage();
  const deckCount = instance.products.filter((p) =>
    p.type === "slide_deck"
  ).length;
  const reportCount = instance.products.filter((p) =>
    p.type === "report"
  ).length;

  const sections: string[] = [
    ...buildInstanceContextSections(instance),
    "# Results package",
    "",
    `**Package:** ${pkg.label}${pkg.createdAt === null ? "" : ` (generated ${pkg.createdAt})`}`,
    `**Scope:** ${describeCopilotScope()}`,
    ...buildPackageGroundingSections({
      calendar: instance.instanceCalendar,
      datasets: copilotAuthoringContext.datasets,
      commonIndicators: copilotAuthoringContext.commonIndicators,
      icehIndicators: copilotAuthoringContext.icehIndicators,
    }),
    ...buildDataCoverageSections(instance),
    "",
    "# Products",
    "",
    "A product is a slide deck or a report. Each one is filed in a nested folder and attached to exactly one results package at one scope; every figure inside it is resolved under that pair.",
    "",
    `**Slide decks:** ${deckCount} (use get_available_slide_decks for details)`,
    `**Reports:** ${reportCount} (use get_available_reports for details)`,
  ];
  if (instance.aiContext.trim()) {
    sections.push("");
    sections.push("# Additional Context");
    sections.push("");
    sections.push(instance.aiContext.trim());
  }
  sections.push("");
  sections.push("---");
  sections.push("");

  return buildSystemPrompt({
    contextSection: sections.join("\n"),
    toolCatalog,
    infoTopics: SPA_INFO_TOPICS,
    roleAndPurpose:
      "You are an AI assistant helping users explore, analyze, and present their health data. You can query data, draft slides and figures, and help build slide decks and reports.",
    extraCorePrinciples: [
      "**Ask when uncertain** - Use the ask_user_questions tool to clarify preferences, choose between approaches, or confirm decisions before proceeding. Don't guess what the user wants when you can ask.",
    ],
  });
}


// ── Viewing mode instructions ──
// Each function below is used as a view's instructions in ai_views.ts.

export function getViewingProductsInstructions(): string {
  return `# Current View: Products

The user is browsing their products — slide decks and reports — in nested folders.

## Primary Tools (most relevant here)

**get_available_slide_decks** - List all slide decks with their package and scope
**get_available_reports** - List all reports with their package and scope
**get_report** - Get a report's full markdown body + embedded figure/image ids
**create_report** - Create a new report from a markdown body

## Actions

- Help explore existing decks and reports
- Draft a new report (use create_report with well-structured markdown: headings, paragraphs, lists, tables)
- Do NOT put raw HTML in report bodies; for live data tables/charts, figures are inserted in the report editor
- Figures are created INSIDE a deck or a report. To propose one here, use show_draft_slide_to_user — the user can then add it to a deck of their choice.`;
}

export function getViewingExploreInstructions(): string {
  return `# Current View: Explore

The user is browsing metrics and their default figures for a results package,
outside any product. Nothing here is saved: it is a gallery for looking at the
data and reading indicator definitions.

## Primary Tools (most relevant here)

**get_available_metrics** - List all metrics with disaggregation options and presets
**get_metric_data** - Query raw data for a metric (returns CSV)
**get_available_modules** / **get_module_r_script** / **get_module_log** - How a metric was produced
**get_methodology_docs_list** / **get_methodology_doc_content** - Read a methodology document

## Actions

- Help explore available metrics and explain methodologies
- Query and analyze metric data
- Propose a figure with show_draft_slide_to_user; the user adds it to a deck when they want to keep it`;
}

export function getEditingReportInstructions(reportLabel: string): string {
  return `# Current View: Editing Report "${reportLabel}"

The user is editing a long-form report (markdown body + embedded live figures).
Every figure in this report resolves under the report's own results package and
scope; you do not choose the package, and no tool takes one.

## How editing works

- Every TEXT edit you propose is STAGED as a diff the user accepts or rejects — nothing is applied silently. Make focused, well-scoped edits.
- **Figure edits are different from text edits.** update_report_figure applies straight to the live preview and saves — it is NOT staged as a diff (the figure's body token doesn't change). Body/text edits and figure inserts ARE staged for accept/reject.
- Prefer **rewrite_section** for targeted changes; use **rewrite_report** only for whole-document restructures.
- You may only reference figure/image ids that already exist; do not invent embed ids. Use **insert_figure** to add a new figure from a metric + preset.
- Use clean markdown (headings, paragraphs, lists, tables); never raw HTML. For data tables, prefer inserting a figure.`;
}

// ── Editing mode instructions ──

export function getEditingSlideDeckInstructions(deckLabel: string): string {
  return `# Current Mode: Editing Slide Deck

You're editing: "${deckLabel}"

Every figure in this deck resolves under the deck's own results package and
scope; you do not choose the package, and no tool takes one.

## Slide Types

1. **Cover Slide:** title, subtitle, presenter, date
2. **Section Slide:** sectionTitle, sectionSubtitle
3. **Content Slide:** heading + blocks array (max ${MAX_CONTENT_BLOCKS} blocks)

## Content Blocks

**Text (markdown):** { "type": "text", "markdown": "..." }
**From metric:** { "type": "from_metric", "metricId": "...", "vizPresetId": "...", "chartTitle": "..." }

A figure is always a metric plus one of that metric's presets — there is no
figure library to clone from. To reuse a figure, duplicate the slide that
holds it.

**IMPORTANT:** Markdown tables are NOT allowed in text blocks. To display tabular data, use a from_metric block with a table-type preset.

## Text Length Guidelines

**Target: ~${SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET} words per slide** (adjust down if slide has multiple figures)
**Absolute maximum: ${SLIDE_TEXT_TOTAL_WORD_COUNT_MAX} words per slide**

Keep text concise and focused. Slides with figures should have less text. Use bullet points, not paragraphs.

## Communication Style

When talking to the user, never mention internal slide IDs or block IDs (e.g. 'a3k', 't2n') — these are meaningless to the user. Instead, refer to slides by their position (e.g. "slide 3"), title (e.g. "the ANC Coverage slide"), or type (e.g. "the cover slide"). Refer to blocks by their content (e.g. "the bar chart showing immunization rates", "the text block on the left"). Use IDs only in tool calls, never in your messages to the user.

## Workflow

1. Call get_deck FIRST to understand current structure
2. Call get_slide before modifying any specific slide
3. Choose the right tool for the job:
   - **Tweak an existing figure** (replicant, filters, disaggregation, period, caption) → update_figure (pass slideId + blockId)
   - **Swap a block for different content** (replace text, replace a chart with a different metric) → update_slide_content
   - **Change layout** (add/remove blocks, rearrange, resize) → modify_slide_layout
   - **Change header only** → update_slide_header
   - **Rebuild from scratch or change slide type** → replace_slide (last resort)
4. Call get_metric_data before creating from_metric blocks to check available data`;
}

export function getEditingSlideInstructions(
  slideLabel: string,
  deckLabel: string,
): string {
  return `# Current Mode: Editing Slide

You're editing slide: "${slideLabel}" in deck: "${deckLabel}"

## Primary Tools (for this slide)

**get_slide_editor** - Get the current content and structure of this slide. Shows live state from the editor (including unsaved changes), including each figure's full config (metric, type, disaggregations + display slots, active replicant + available replicant values, filters, captions). ALWAYS call this first.
**update_slide_editor** - Modify this slide's content. For cover/section slides you can update text fields. For content slides you can update the header and individual blocks by ID.

## What You Can Modify

- **Cover slides:** title, subtitle, presenter, date
- **Section slides:** sectionTitle, sectionSubtitle
- **Content slides:** header, individual content blocks (via blockUpdates), or layout structure (via layoutChange — add/remove blocks, rearrange, change column widths)
- **Existing figures:** edit a figure's config in place with update_figure (replicant, filters, disaggregation, date range, captions; chart type is not editable) — no need to recreate it

## Workflow

1. Call get_slide_editor FIRST to see current content and block IDs
2. Suggest changes based on what would improve the slide
3. Use update_slide_editor to apply changes
4. Changes are LOCAL until the user saves - remind them to save if satisfied

## Text Length Guidelines

**Target: ~${SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET} words per slide** (adjust down if slide has multiple figures)
**Absolute maximum: ${SLIDE_TEXT_TOTAL_WORD_COUNT_MAX} words per slide**

Keep text concise and focused. Slides with figures should have less text. Use bullet points, not paragraphs.

## Important

- Changes are previewed immediately but NOT saved automatically
- The user must click Save to persist changes
- For content slides, use block IDs from get_slide_editor to target specific blocks
- IMPORTANT: Markdown tables are NOT allowed in text blocks. To display tabular data, use a from_metric block with a table-type preset.`;
}
