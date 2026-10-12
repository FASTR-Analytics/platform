import {
  buildAiContextSections,
  buildDataCoverageSections,
  buildInstanceContextSections,
  buildPackageBlock,
  buildSystemPrompt,
  type DatasetType,
  type ExploreViewBinding,
  type ExploreViewTypeId,
  type InstalledModuleSummary,
  type InstanceState,
  MAX_CONTENT_BLOCKS,
  type PackageScope,
  periodChoiceId,
  type ResolvedView,
  type RunAuthoringContext,
  type RunCatalogStatus,
  type RunListingItem,
  type RunProgress,
  runProgressSteps,
  runStageLabel,
  SLIDE_TEXT_TOTAL_WORD_COUNT_MAX,
  SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET,
  t3,
} from "lib";
import { scopeDisplayLabel } from "~/components/_shared/mod.ts";
import { SPA_INFO_TOPICS } from "./client_info_topics";

// The copilot's system prompt: the shared grounding blocks (lib/ai_tools/
// build_system_prompt.ts) over the instance alone: country, terminology, data
// coverage and the instance-level `ai_context`, then the reference docs, the
// role, the principles and the interpretation framework.
//
// INSTANCE LEVEL: only an instance input (name, country, admin-area labels,
// structure counts, data sources, ai_context) changes it, so one
// conversation keeps one prompt through every view and every package, which
// is what append-only turns and the prompt cache need. No date, no package,
// no level and no tool catalogue ride here: the date and the package in view
// are per-turn blocks (buildCopilotPackageBlock), the level line rides a
// product view's instructions (ai_views.ts) and the tools ride the request.
export function buildSystemPromptForContext(instance: InstanceState): string {
  const sections: string[] = [
    ...buildInstanceContextSections(instance),
    ...buildDataCoverageSections(instance),
    ...buildAiContextSections(instance.aiContext),
    "",
    "---",
    "",
  ];
  return buildSystemPrompt({
    contextSection: sections.join("\n"),
    infoTopics: SPA_INFO_TOPICS,
    roleAndPurpose:
      "You are an AI assistant helping users explore, analyze and present the health data in this FASTR instance. The user moves through the app while you talk: each message tells you the current view, its state and, where one is in view, the results package and scope every read resolves under. You can query data, draft slides and figures, and help build the slide deck or report the user has open; a tool outside the current view refuses when called, so work with what the view offers.",
    extraCorePrinciples: [
      "**Ask when uncertain** - Use the ask_user_questions tool to clarify preferences, choose between approaches, or confirm decisions before proceeding. Don't guess what the user wants when you can ask.",
    ],
  });
}

// The package block for a pair: the package's label and date from the ready
// list (a package no longer ready has no entry, so the run id is the honest
// fallback), the scope's display label and definition from the scopes list,
// and the authoring context's grounding. Read live, so a rename or a scope
// edit changes the text and the block rides again.
export function buildCopilotPackageBlock(
  instance: InstanceState,
  scope: PackageScope,
  authoringContext: RunAuthoringContext,
): string {
  const pkg = instance.readyPackages.find((p) => p.id === scope.runId);
  const row = instance.scopes.find((s) => s.id === scope.scopeId);
  return buildPackageBlock({
    packageLabel: pkg?.label ?? scope.runId,
    createdAt: pkg?.createdAt ?? null,
    scope: row === undefined
      ? undefined
      : { label: scopeDisplayLabel(row), definition: row.definition },
    grounding: {
      calendar: instance.instanceCalendar,
      datasets: authoringContext.datasets,
      hmisIndicators: authoringContext.hmisIndicators,
      icehIndicators: authoringContext.icehIndicators,
    },
  });
}

// Below edit level a product view's instructions carry this line, read live
// at send (ai_views.ts): the editing tools are registered for every user and
// refuse below edit, so the model is told not to reach for them.
export const PRODUCT_VIEW_ONLY_LINE =
  "The user can view this product but not change it: read it and answer questions about it, and do not call its editing tools, which refuse below edit level.";

// ── View instructions ──
// Each function below is used as a view's instructions in ai_views.ts.

export function getOpeningProductInstructions(): string {
  return `# Current View: Opening product

The product is still loading, or it failed to load and the page shows the error. Do not call editing tools yet. Tell the user to wait a moment or, if the page shows an error, to close the product and open it again.`;
}

// ── Editing mode instructions ──

// The deck workflow: the deck view's own, and the slide view's for the other
// slides and the whole deck, since every deck tool runs there too.
const DECK_WORKFLOW = `1. Call get_deck FIRST to understand current structure
2. Call get_slide before modifying any specific slide
3. Choose the right tool for the job:
   - **Tweak an existing figure** (replicant, filters, disaggregation, period, caption) → update_figure (pass slideId + blockId; inside the slide editor omit slideId, since there it edits only the open slide)
   - **Swap a block for different content** (replace text, replace a chart with a different metric) → update_slide_content
   - **Change layout** (add/remove blocks, rearrange, resize) → modify_slide_layout
   - **Change header only** → update_slide_header
   - **Rebuild from scratch or change slide type** → replace_slide (last resort)
4. Call get_metric_data before creating from_metric blocks to check available data`;

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

${DECK_WORKFLOW}`;
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
4. Changes apply to the open slide at once and save automatically

## Other slides and the whole deck

${DECK_WORKFLOW}

## Text Length Guidelines

**Target: ~${SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET} words per slide** (adjust down if slide has multiple figures)
**Absolute maximum: ${SLIDE_TEXT_TOTAL_WORD_COUNT_MAX} words per slide**

Keep text concise and focused. Slides with figures should have less text. Use bullet points, not paragraphs.

## Important

- Changes apply to the open slide at once and save automatically; there is no Save button
- For content slides, use block IDs from get_slide_editor to target specific blocks
- IMPORTANT: Markdown tables are NOT allowed in text blocks. To display tabular data, use a from_metric block with a table-type preset.`;
}

// The view states of the Results and Explore pages: what the user is looking
// at that changes without a navigation, a line or two on every message. On
// these pages the module and the package's status are what the user sees,
// which narrows "nothing about modules goes into the AI context" to the
// package grounding (SYSTEM_13).

function joinParts(parts: (string | undefined)[]): string {
  return parts.filter((part) => part !== undefined).join(" | ");
}

// What Explore resolves on its pair: the family, module, view and type are
// the stored choices resolved against the package, undefined where the
// package offers nothing to resolve; `resolved` is the view as the frame
// resolved it for its toolbar (the metric, the switch, the level, each pin,
// the category, the period and the grain, against the package and the
// metric's possible values), undefined while no metric of the view is ready.
export type ExploreSelection = {
  family: DatasetType | undefined;
  module: InstalledModuleSummary | undefined;
  view: ExploreViewBinding | undefined;
  type: ExploreViewTypeId | undefined;
  resolved: ResolvedView | undefined;
};

function labelWithId(label: string, id: string): string {
  return label === id ? id : `${label} (${id})`;
}

function optionLabel(
  options: { id: string; label: string }[],
  id: string,
): string {
  return labelWithId(options.find((o) => o.id === id)?.label ?? id, id);
}

function periodLabel(v: ResolvedView): string | undefined {
  const time = v.time;
  if (time === undefined) return undefined;
  const id = periodChoiceId(v.query.period, time.choices);
  return time.choices.find((c) => c.id === id)?.label ??
    JSON.stringify(v.query.period);
}

// Empty values read every option, as the toolbar's placeholder says.
function categoryPart(v: ResolvedView): string | undefined {
  const category = v.category;
  if (category?.placement !== "laid_out") return undefined;
  const values = category.values.length === 0
    ? `all (${category.options.length})`
    : category.values.map((id) => optionLabel(category.options, id)).join(", ");
  return `${category.dimension}: ${values}`;
}

// The toolbar's values, each by the id a package tool takes: a pin over the
// server's cap says so, and a pin with no value yet is left out.
function formatResolvedSettings(v: ResolvedView): string {
  const period = periodLabel(v);
  return joinParts([
    v.switch === undefined ? undefined : `${t3(v.switch.label)}: ${
      optionLabel(
        v.switch.options.map((o) => ({ id: o.id, label: t3(o.label) })),
        v.switch.value,
      )
    }`,
    v.area === undefined ? undefined : `level: ${v.area.level}`,
    ...v.pins.map((pin) =>
      pin.status === "too_many_values"
        ? `${pin.dimension}: too many values (over 500)`
        : pin.value === undefined
        ? undefined
        : `${pin.dimension}: ${optionLabel(pin.options, pin.value)}`
    ),
    categoryPart(v),
    period === undefined ? undefined : `period: ${period}`,
    v.time?.grainShown ? `grain: ${v.query.grain}` : undefined,
    v.droppedIndicators.length === 0
      ? undefined
      : `${v.droppedIndicators.length} chosen indicator(s) not in this package`,
  ]);
}

// Null while Explore has no package or its authoring context is still
// loading, so the message carries no state section rather than a stale one.
export function formatExploreState(
  selection: ExploreSelection | undefined,
): string | null {
  if (selection === undefined) return null;
  const line = joinParts([
    `Family: ${selection.family ?? "none"}`,
    selection.module === undefined
      ? undefined
      : `Module: ${selection.module.label} (${selection.module.id})`,
    selection.view === undefined
      ? undefined
      : `View: ${t3(selection.view.label)} (${selection.view.id})`,
    selection.type === undefined ? undefined : `Type: ${selection.type}`,
    selection.resolved === undefined
      ? undefined
      : `Metric: ${selection.resolved.metric.id}`,
  ]);
  return selection.resolved === undefined
    ? line
    : `${line}\nSettings: ${formatResolvedSettings(selection.resolved)}`;
}

// A stored `ended` stage is the transform's stamp on a run that recorded no
// stage, not a place the run is or died in.
function stageLabel(progress: RunProgress | null): string | undefined {
  return progress === null || progress.stage.kind === "ended"
    ? undefined
    : runStageLabel(progress);
}

export function formatPackageState(args: {
  status: RunCatalogStatus;
  progress: RunProgress | null;
  openModuleId: string | undefined;
}): string {
  const { status, progress, openModuleId } = args;
  const stage = stageLabel(progress);
  switch (status) {
    case "generating": {
      const steps = progress === null ? undefined : runProgressSteps(progress);
      return joinParts([
        "Status: generating",
        stage === undefined ? undefined : `stage: ${stage}`,
        steps === undefined
          ? undefined
          : `modules done: ${steps.done}/${steps.total}`,
        progress?.currentModuleId
          ? `current module: ${progress.currentModuleId}`
          : undefined,
      ]);
    }
    case "failed":
      return joinParts([
        "Status: failed",
        stage === undefined ? undefined : `failed at: ${stage}`,
        `error: ${progress?.errorDetail ?? "none recorded"}`,
      ]);
    case "ready":
      return joinParts([
        "Status: ready",
        openModuleId === undefined ? undefined : `open module: ${openModuleId}`,
      ]);
    case "retired":
      return "Status: retired";
  }
}

const RUN_STATUSES: readonly RunCatalogStatus[] = [
  "ready",
  "generating",
  "failed",
  "retired",
];

export function formatResultsPackagesState(
  pinnedRunId: string | null,
  runs: RunListingItem[],
): string {
  const pinned = pinnedRunId === null
    ? "none"
    : runs.find((r) => r.id === pinnedRunId)?.label ?? pinnedRunId;
  const counts = RUN_STATUSES.map(
    (status) =>
      [status, runs.filter((r) => r.status === status).length] as const,
  )
    .filter(([, n]) => n > 0)
    .map(([status, n]) => `${n} ${status}`);
  return `Pinned package: ${pinned} | Packages: ${
    counts.length === 0 ? "none" : counts.join(", ")
  }`;
}
