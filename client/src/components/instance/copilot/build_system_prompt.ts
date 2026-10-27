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
import type { DataPageId } from "./ai_views";

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

// The screens that cover a product editor: the package tools still run on
// the product's package, but the product's editing tools refuse until the
// user is back in the editor, so each names the step that gets them there.
export function getDeckSettingsInstructions(label: string): string {
  return `# Current View: Settings of the slide deck "${label}"

The user is on the deck's settings screen (theme, logos, footer), which covers the deck. The deck's name is not on it: renaming is File > "Name and folder" or the title in the products list. The deck's slide tools refuse here. To change slides, tell the user to close Settings with its back button to return to the deck; do not describe any other view. The package tools work as usual.`;
}

export function getHistoryInstructions(
  label: string,
  kind: "deck" | "report",
): string {
  const noun = kind === "deck" ? "slide deck" : "report";
  const tools = kind === "deck" ? "slide tools" : "report editing tools";
  return `# Current View: Version history of the ${noun} "${label}"

The user is looking at the ${noun}'s version history, which covers the editor: a list of saved versions with a read-only preview, and restore buttons for users who can configure the ${noun}. The ${tools} refuse here. To edit the ${noun}, tell the user to close History with its back button to return to the editor; do not describe any other view. The package tools work as usual.`;
}

// The pages with no package in view: each names itself, so the model knows
// what the user is looking at and that no package tool runs here.
const NO_PACKAGE_LINE =
  "No results package is in view here, so the package tools refuse; answer from the instance context and the reference documents (get_reference_docs, get_reference_doc).";

export function getProductsInstructions(): string {
  return `# Current View: Products

The user is on the Products page: the slide decks and reports of this instance, in folders. Call list_products to see them with their folder, package, scope and the user's access level. ${NO_PACKAGE_LINE} The user opens a product from this page; its tools become available once it is open.`;
}

const DATA_PAGE_LABELS: Record<DataPageId, string> = {
  registry_configuration: "the facility registry's configuration",
  facilities: "the facility registry and its import",
  geojson_maps: "the GeoJSON maps and their upload and mapping",
  admin_area_labels: "the admin area labels",
  hmis_indicators: "the HMIS indicators and the DHIS2 indicator search",
  hmis_data: "the HMIS data, its ledger, imports and deletion",
  population: "the population data and its import",
  hfa_time_points: "the HFA time points",
  hfa_weights: "the HFA sampling weights and their import",
  hfa_indicators: "the HFA indicators",
  hfa_data: "the HFA data, its imports and deletion",
  iceh_data: "the ICEH data, its imports and deletion",
};

const FAMILY_LABELS: Record<DatasetType, string> = {
  hmis: "HMIS",
  hfa: "HFA",
  iceh: "ICEH",
};

export function getDataPageInstructions(
  page: DataPageId,
  family: DatasetType | undefined,
): string {
  const where = family === undefined
    ? DATA_PAGE_LABELS[page]
    : `${DATA_PAGE_LABELS[page]} (${FAMILY_LABELS[family]})`;
  return `# Current View: Data page "${page}"

The user is on a Data page: ${where}. ${NO_PACKAGE_LINE}`;
}

export function getAssetsInstructions(): string {
  return `# Current View: Assets

The user is on the Assets page: the files uploaded to this instance (import inputs, images for decks and reports). ${NO_PACKAGE_LINE}`;
}

export function getUsersInstructions(): string {
  return `# Current View: Users

The user is on the Users page, which lists the instance's users and their permissions. You are told nothing of the roster: no names, no emails. ${NO_PACKAGE_LINE}`;
}

// The figure editor's three views: what is being edited or shown, by the
// metric label its host passes, and what the two figure editor tools do to
// the draft.
export type FigureEditorHost = "slide" | "report" | "package";

const FIGURE_EDITOR_TOOLS_LINES =
  `get_figure_editor reads the draft as it stands in the editor (metric, type, disaggregations and their display slots, filters, the replicant, the period and the captions). update_figure_editor changes the draft in place: pass only the fields to change; the change shows in the editor at once. The chart type can be changed here, which is the one place it can.`;

export function getFigureEditorInstructions(
  label: string,
  host: FigureEditorHost,
): string {
  switch (host) {
    case "slide":
      return `# Current View: Figure editor (slide)

The user is editing the figure "${label}" of the open slide in the figure editor. ${FIGURE_EDITOR_TOOLS_LINES} The user keeps the result with the editor's Apply button or discards it with Cancel; under live co-editing every change streams into the deck as it is made. The figure resolves under the deck's results package and scope.`;
    case "report":
      return `# Current View: Figure editor (report)

The user is editing the figure "${label}" of the open report in the figure editor. ${FIGURE_EDITOR_TOOLS_LINES} The user keeps the result with the editor's Apply button or discards it with Cancel; under live co-editing every change streams into the report as it is made. The figure resolves under the report's results package and scope.`;
    case "package":
      return `# Current View: Figure viewer (package)

The user is looking at the package's preset "${label}" in the figure viewer, which belongs to no product: the draft is for looking at, and closing the viewer keeps nothing. ${FIGURE_EDITOR_TOOLS_LINES} The figure resolves under the package page's package and scope.`;
  }
}

export function getResultsFileInstructions(
  moduleId: string,
  resultsObjectId: string,
): string {
  return `# Current View: Results file

The user is looking at the raw results file "${resultsObjectId}" of module "${moduleId}", read under the package and scope in view: the rows behind the figure's metric, as a table. The package reads resolve under the same pair.`;
}

export function getUserInstructions(): string {
  return `# Current View: User

The user is on one user's detail page (permissions and scope access). You are told nothing of that user: no name, no email. ${NO_PACKAGE_LINE}`;
}

// The HFA indicators manager's view: the guidance S5 supplies through the
// view's context (components/data/hfa/indicators/ai/instructions.ts), under
// the chat's framing.
export function getHfaIndicatorsInstructions(guidance: string): string {
  return `# Current View: HFA indicators manager

${guidance}

${NO_PACKAGE_LINE}`;
}

// The HFA code editor's view: one indicator's unsaved draft, read and
// written live through the two editor tools, which the HFA reads serve.
export function getHfaIndicatorEditorInstructions(label: string): string {
  return `# Current View: HFA indicator code editor

The user has the HFA indicator "${label}" open in the code editor. get_hfa_indicator_editor reads the editor's unsaved state: the labels, type, aggregation, categories and the indicator code of every round, each round with the issues the editor's own validation finds. update_hfa_indicator_editor changes that state in place: pass only the fields to change; the change shows in the editor at once and stays unsaved until the user saves it (Save) or discards it (Cancel). The HFA reads (the survey dictionary, a variable's values, the taxonomy, other indicators and their code, validation) are available here; the batched HFA writes are not, since the user edits this one indicator in the editor. ${NO_PACKAGE_LINE}`;
}

// ── Editing mode instructions ──

export function getEditingSlideDeckInstructions(deckLabel: string): string {
  return `# Current View: Editing slide deck

You're editing the slide deck "${deckLabel}".

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

## The Open Slide

The deck editor shows the deck's slides in a rail with one slide open beside it. The view state names the open slide, or says there is none. An edit to the open slide shows on the canvas at once and saves automatically; an edit to any other slide is saved immediately. Every slide tool takes a slideId and works on any slide of the deck, open or not, so never ask the user to open, close or switch a slide or a view.

## Workflow

1. Call get_deck FIRST to understand the deck's structure
2. Call get_slide before changing any slide: it shows the slide's content and block IDs (the open slide as the canvas shows it, unsaved changes included) and each figure's full config
3. Choose the right tool for the job:
   - **Change text, blocks or layout** (a cover's or section's fields, a content slide's header, a block's content, adding, removing, rearranging or resizing blocks) → update_slide
   - **Tweak an existing figure** (replicant, filters, disaggregation, period, captions; not the chart type) → update_figure (slideId + blockId)
   - **Rebuild a slide from scratch or change its type** → replace_slide (last resort)
   - **Change the deck's structure** → create_slide, delete_slides, duplicate_slides, move_slides
4. Call get_metric_data before creating any from_metric block, to check the data it needs is available
5. Filter a content slide's from_metric block to the indicators the slide's text names: an unfiltered multi-indicator metric draws one panel per indicator, and the slide's layout overflows the page`;
}

// The view states of the Results, Explore and Data pages: what the user is
// looking at that changes without a navigation, a line or two on every
// message. On the Results and Explore pages the module and the package's
// status are what the user sees, which narrows "nothing about modules goes
// into the AI context" to the package grounding (SYSTEM_13).

function joinParts(parts: (string | undefined)[]): string {
  return parts.filter((part) => part !== undefined).join(" | ");
}

// The Data switchboard's rows as its view state: each row's label and its
// status mark, never its summary. The status vocabulary is the switchboard's
// (`components/data/data.tsx` reads it from here): "unset" is an optional
// item left empty, shown but not flagged as missing.
export type DataRowStatus = "ready" | "partial" | "missing" | "unset";

export type DataSectionForAI = {
  heading: string;
  rows: { label: string; status: DataRowStatus }[];
};

const DATA_STATUS_LABELS: Record<DataRowStatus, string> = {
  ready: "Ready",
  partial: "Partial",
  missing: "Missing",
  unset: "Not set",
};

export function formatDataState(sections: DataSectionForAI[]): string {
  return sections.map((section) =>
    `${section.heading}: ${
      joinParts(
        section.rows.map((row) =>
          `${row.label}: ${DATA_STATUS_LABELS[row.status]}`
        ),
      )
    }`
  ).join("\n");
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
