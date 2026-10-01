import {
  buildDataCoverageSections,
  buildInstanceContextSections,
  buildPackageGroundingSections,
  buildSystemPrompt,
  type InstanceState,
  MAX_CONTENT_BLOCKS,
  type PackageScope,
  type RunAuthoringContext,
  type Scope,
  SLIDE_TEXT_TOTAL_WORD_COUNT_MAX,
  SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET,
} from "lib";
import { SPA_INFO_TOPICS } from "./client_info_topics";

// What the scope limits, in words the model can act on: a figure it authors
// reads only rows inside these limits, so a filter outside them returns
// nothing.
function scopeLines(scope: Scope | undefined): string[] {
  if (scope === undefined) return ["**Scope:** whole package"];
  const d = scope.definition;
  const list = (values: string[]) =>
    values.length === 0 ? "none" : values.join(", ");
  const limits = [
    d.geography && `admin area 2 "${d.geography.adminArea2}"`,
    d.time.years && `years ${d.time.years.start} to ${d.time.years.end}`,
    d.time.hfaTimePoints && `HFA time points ${list(d.time.hfaTimePoints)}`,
    d.modules && `modules ${list(d.modules)}`,
    d.indicators.hmis && `HMIS indicators ${list(d.indicators.hmis)}`,
    d.indicators.hfa && `HFA indicators ${list(d.indicators.hfa)}`,
    d.indicators.iceh && `ICEH indicators ${list(d.indicators.iceh)}`,
  ].filter((limit) => typeof limit === "string");
  return [
    `**Scope:** ${scope.label}`,
    limits.length === 0
      ? "This scope limits nothing: every read returns the whole package."
      : `Every read returns only the rows inside this scope: ${
        limits.join("; ")
      }. A limit applies to a table only when the table has a column for it; a table without one is returned whole.`,
  ];
}

// The copilot's system prompt: the shared grounding blocks (lib/ai_tools/
// build_system_prompt.ts) plus the instance's own prose: the open product's
// results package and scope, and the instance-level `ai_context`
// (PLAN_PRODUCTS_RESTRUCTURE D15).
//
// BYTE-STABLE for the life of one mount: the pair and the authoring context
// are fixed per mount (a reattach remounts), no view argument is taken, and
// per-view instructions ride each view's instructions in ai_views.ts as a
// per-turn ephemeral section. Only the instance AI context can change it.
export function buildSystemPromptForContext(
  instance: InstanceState,
  scope: PackageScope,
  authoringContext: RunAuthoringContext,
  toolCatalog: string,
): string {
  const pkg = instance.readyPackages.find((p) => p.id === scope.runId);
  // A product attached to a package that is no longer ready has no entry:
  // the run id is the honest fallback rather than a fabricated label.
  const packageLine = pkg
    ? `**Package:** ${pkg.label}${
      pkg.createdAt === null ? "" : ` (generated ${pkg.createdAt})`
    }`
    : `**Package:** ${scope.runId}`;
  const sections: string[] = [
    ...buildInstanceContextSections(instance),
    "# Results package",
    "",
    "The open product is attached to exactly one results package at one scope; every figure inside it, and every metric read you make, resolves under that pair.",
    "",
    packageLine,
    ...scopeLines(instance.scopes.find((s) => s.id === scope.scopeId)),
    ...buildPackageGroundingSections({
      calendar: instance.instanceCalendar,
      datasets: authoringContext.datasets,
      hmisIndicators: authoringContext.hmisIndicators,
      icehIndicators: authoringContext.icehIndicators,
    }),
    ...buildDataCoverageSections(instance),
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
      "You are an AI assistant helping users explore, analyze, and present their health data inside the slide deck or report they have open. You can query data, draft slides and figures, and help build that deck or report.",
    extraCorePrinciples: [
      "**Ask when uncertain** - Use the ask_user_questions tool to clarify preferences, choose between approaches, or confirm decisions before proceeding. Don't guess what the user wants when you can ask.",
    ],
  });
}

// ── View instructions ──
// Each function below is used as a view's instructions in ai_views.ts.

export function getOpeningProductInstructions(): string {
  return `# Current View: Opening product

The product is still loading. Tell the user to wait a moment and ask again; do not call editing tools yet.`;
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

A figure is always a metric plus one of that metric's presets. There is no
figure library to clone from: to reuse a figure, duplicate the slide that holds
it.

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
