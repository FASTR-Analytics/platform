import {
  getCountryLabel,
  MAX_CONTENT_BLOCKS,
  SLIDE_TEXT_TOTAL_WORD_COUNT_MAX,
  SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET,
} from "../consts.ts";
import type { RunDataset } from "../types/run_datasets.ts";
import type { InstanceGrounding } from "../types/instance_sse.ts";
import type { InstanceCalendar } from "../types/instance.ts";
import type { PeriodBounds } from "../types/presentation_objects.ts";
import type { RunHmisIndicator } from "../types/run_manifest.ts";
import type { GeoJsonMapSummary } from "../types/geojson_maps.ts";
import type { FacilityFamily } from "../types/structure.ts";
import { inferPeriodFormatFromValue } from "../types/_metric_installed.ts";
import { describeIndicatorFacts } from "./format_metric_data_for_ai.ts";
import type { ScopeDefinition } from "../types/scope.ts";
import { MODULE_FAMILY_ORDER } from "../group_metrics.ts";
import {
  fastrThemeProse,
  fastrThemeTokens,
} from "../../report-forge/engine/report_fastr_themes.ts";

// The shared halves of the AI system prompt: what both surfaces (the SPA
// copilot and the /mcp get_overview) ground the model with. Each surface
// assembles its own context section from these building blocks, the instance
// ai_context (buildAiContextSections) the last of them, and hands it to
// buildSystemPrompt.
//
// The SPA's system prompt is INSTANCE LEVEL
// (client/src/components/instance/copilot/build_system_prompt.ts): only an
// instance input changes it, so one conversation keeps one prompt through
// every view and every package. The package grounding rides the package
// block (buildPackageBlock), a per-turn consumer block the chat attaches to
// a message whenever its text is new to the conversation, and the date rides
// the date block the same way; per-view text rides each view's instructions
// and state (ai_views.ts). /mcp's get_overview is a one-shot text with no
// tools array or message behind it, so it asks buildSystemPrompt for the date
// and the tool catalogue (server/mcp/mcp_tools.ts).

export type SystemPromptParts = {
  contextSection: string;
  // "# Role and Purpose" body: what THIS surface's assistant is for.
  roleAndPurpose: string;
  // Core principles this surface adds after the shared ones (the chat adds
  // CHAT_CORE_PRINCIPLES).
  extraCorePrinciples: readonly string[];
  // The date header and the `# Available Tools` section, for a surface with
  // no per-turn blocks and no tools array of its own (get_overview). The
  // chat passes neither: its date rides the date block and its tools ride
  // the request's tools array.
  currentDate?: string;
  toolCatalog?: string;
};

export function isoDateToday(): string {
  return new Date().toISOString().split("T")[0];
}

export function buildDateBlock(date: string): string {
  return `**CURRENT DATE: ${date}**`;
}

export function buildSystemPrompt(parts: SystemPromptParts): string {
  const dateHeader = parts.currentDate === undefined
    ? ""
    : `${buildDateBlock(parts.currentDate)}\n\n---\n\n`;
  const baseInstructions = getBaseInstructions(
    parts.roleAndPurpose,
    parts.extraCorePrinciples,
  );
  const toolsSection = parts.toolCatalog === undefined
    ? ""
    : `\n# Available Tools\n\n${parts.toolCatalog}\n`;
  return `${dateHeader}${parts.contextSection}${REFERENCE_DOCS_SECTION}${baseInstructions}${toolsSection}`;
}

// The documents themselves, and when to read each, ride the two reference
// tools: the list tool's description names them, so the prompt only points
// there.
const REFERENCE_DOCS_SECTION =
  "# Reference documentation\n\nAuthoritative reference documents (the app's own and the FASTR methodology hub's chapters) are listed by get_reference_docs and read by get_reference_doc. Read the relevant document FIRST when a task touches its subject, and follow it.\n\n";

// ── Instance grounding: country, terminology, data sources ──

export function buildInstanceContextSections(
  instance: InstanceGrounding,
): string[] {
  const sections: string[] = [];
  sections.push("# Instance Information");
  sections.push("");

  if (instance.countryIso3) {
    sections.push(
      `**Country:** ${
        getCountryLabel(instance.countryIso3)
      } (${instance.countryIso3})`,
    );
  }

  sections.push(`**Instance:** ${instance.instanceName}`);
  sections.push("");

  sections.push("# Terminology");
  sections.push("");
  sections.push("**Geographic levels:**");
  sections.push("- admin_area_1 is always the national level");
  // Depth is per facility registry; the shared level labels apply to both.
  const hmisDepth = instance.structureSchemaHmis?.adminDepth;
  const hfaDepth = instance.structureSchemaHfa?.adminDepth;
  const maxAdminArea = Math.max(hmisDepth ?? 1, hfaDepth ?? 1);
  if (maxAdminArea >= 2) {
    const aa = maxAdminArea;
    const labels = instance.adminAreaLabels;
    const hasCustomLabels = labels.label2 || labels.label3 || labels.label4;

    if (hasCustomLabels) {
      sections.push("- Sub-national levels in this instance:");
      if (aa >= 2 && labels.label2) {
        sections.push(`  - admin_area_2 = "${labels.label2}"`);
      }
      if (aa >= 3 && labels.label3) {
        sections.push(`  - admin_area_3 = "${labels.label3}"`);
      }
      if (aa >= 4 && labels.label4) {
        sections.push(`  - admin_area_4 = "${labels.label4}"`);
      }
      sections.push(
        "- Use these terms instead of 'admin_area_2' etc. when communicating with the user",
      );
    } else {
      const sub = aa >= 4
        ? "admin_area_2, admin_area_3, admin_area_4 etc."
        : aa >= 3
        ? "admin_area_2, admin_area_3 etc."
        : "admin_area_2 etc.";
      sections.push(`- ${sub} are sub-national levels. For example:`);
      const examples: {
        country: string;
        aa2: string;
        aa3?: string;
        aa4?: string;
      }[] = [
        {
          country: "Nigeria",
          aa2: "Zone",
          aa3: "State",
          aa4: "LGA (Local Government Area)",
        },
        { country: "Ghana", aa2: "Region", aa3: "District" },
        { country: "Burkina Faso", aa2: "Région", aa3: "Province" },
        { country: "Zambia", aa2: "Province", aa3: "District" },
        { country: "Liberia", aa2: "County", aa3: "District" },
        { country: "Sierra Leone", aa2: "District", aa3: "District Council" },
        {
          country: "République Démocratique du Congo (RDC)",
          aa2: "Province",
          aa3: "Zone de Santé",
        },
      ];
      for (const ex of examples) {
        let line = `  - ${ex.country}: admin_area_2 = ${ex.aa2}`;
        if (aa >= 3 && ex.aa3) line += `, admin_area_3 = ${ex.aa3}`;
        if (aa >= 4 && ex.aa4) line += `, admin_area_4 = ${ex.aa4}`;
        sections.push(line);
      }
      sections.push(
        "- If this instance's country matches one of the above, use that country's terminology instead of 'admin_area_2' etc.",
      );
    }
    if (
      hmisDepth !== undefined && hfaDepth !== undefined &&
      hmisDepth !== hfaDepth
    ) {
      sections.push(
        `- The HMIS facility registry uses levels down to admin_area_${hmisDepth}; the HFA registry down to admin_area_${hfaDepth}. Each registry's data only carries its own levels.`,
      );
    }
  }
  sections.push("");
  const hasHmis = instance.datasetsWithData.includes("hmis");
  const hasHfa = instance.datasetsWithData.includes("hfa");
  const hasIceh = instance.datasetsWithData.includes("iceh");
  if (hasHmis || hasHfa || hasIceh) {
    sections.push("**Data sources:**");
    if (hasHmis) {
      sections.push(
        "- HMIS: Health Management Information System (routine facility reporting)",
      );
    }
    if (hasHfa) {
      sections.push("- HFA: Health Facility Assessment (facility survey data)");
    }
    if (hasIceh) {
      sections.push(
        "- ICEH: International Center for Equity in Health survey data (DHS, MICS, and other nationally representative household surveys)",
      );
    }
    sections.push("");
  }
  return sections;
}

// A map figure renders only where the instance holds a boundary file for the
// figure's registry at the figure's level, so the model is told the levels up
// front and draws a table elsewhere instead of a map the resolver refuses.
export function buildMapCoverageLines(maps: GeoJsonMapSummary[]): string[] {
  if (maps.length === 0) {
    return [
      "- This results package has no boundary map files, so no map figure can render: use tables.",
    ];
  }
  const families: FacilityFamily[] = ["hmis", "hfa"];
  const parts = families.flatMap((family) => {
    const levels = maps
      .filter((m) => m.family === family)
      .map((m) => m.adminAreaLevel)
      .toSorted((a, b) => a - b);
    return levels.length === 0 ? [] : [
      `${family.toUpperCase()} at ${
        levels.map((l) => `admin_area_${l}`).join(", ")
      }`,
    ];
  });
  return [
    `- Boundary map files exist for ${
      parts.join("; ")
    }. A map figure renders only at those levels for that registry; at any other level use a table.`,
  ];
}

// ── Package grounding: what ONE results package holds ──
//
// Derivable from either the open product's package (the SPA) or a run manifest
// (the pinned package on /mcp): the caller maps to this shape.

export type PackageGrounding = {
  // The calendar the package's period ids are in: a package fact, captured
  // into the run manifest at finalize (`manifest.calendar`, never the env
  // global). The SPA's attached package was generated on this instance, so it
  // passes the instance calendar.
  calendar: InstanceCalendar;
  datasets: RunDataset[];
  hmisIndicators: RunHmisIndicator[];
  icehIndicators: { id: string; label: string }[];
  // The package's overall period range at its finest time grain (null = no
  // time-indexed results). Omitted when the caller cannot know it: the SPA
  // holds no manifest client-side; /mcp reads it from the manifest.
  periodCoverage?: PeriodBounds | null;
  // The boundary maps a figure on this package can draw: the package's own
  // geojson stamp, or the instance's maps for a package without a capture.
  mapLevels: GeoJsonMapSummary[];
};

export function buildPackageGroundingSections(
  grounding: PackageGrounding,
): string[] {
  const sections: string[] = [];
  sections.push("");
  sections.push(
    `**Calendar:** ${grounding.calendar} (period ids like 202503 are year+month in this calendar)`,
  );
  const hmisDataset = grounding.datasets.find(
    (d) => d.datasetType === "hmis",
  );
  const hfaDataset = grounding.datasets.find(
    (d) => d.datasetType === "hfa",
  );
  const icehDataset = grounding.datasets.find(
    (d) => d.datasetType === "iceh",
  );

  if (hmisDataset || hfaDataset || icehDataset) {
    sections.push("");
    sections.push("**Loaded datasets:**");
    if (hmisDataset && hmisDataset.datasetType === "hmis") {
      sections.push(`- HMIS data (version ${hmisDataset.info.version.id})`);
    }
    if (hfaDataset) {
      sections.push(`- HFA data`);
    }
    if (icehDataset) {
      sections.push(`- ICEH survey data`);
    }
  }

  sections.push("");
  sections.push("**Boundary maps:**");
  sections.push(...buildMapCoverageLines(grounding.mapLevels));

  if (grounding.hmisIndicators.length > 0) {
    sections.push("");
    sections.push(
      `**HMIS indicators (${grounding.hmisIndicators.length}):** id: label [format; direction; thresholds in display units; target] = formula over counts and population types (computed indicators only). Read every value against its declared direction.`,
    );
    for (const ind of grounding.hmisIndicators) {
      sections.push(describeHmisIndicatorForPrompt(ind));
    }
  }

  if (grounding.icehIndicators.length > 0) {
    sections.push("");
    sections.push(
      `**ICEH indicators (${grounding.icehIndicators.length}):**`,
    );
    for (const ind of grounding.icehIndicators) {
      sections.push(`- ${ind.id}: ${ind.label}`);
    }
  }

  if (grounding.periodCoverage !== undefined) {
    sections.push("");
    sections.push(
      grounding.periodCoverage === null
        ? "**Period coverage:** no time-indexed results"
        : `**Period coverage:** ${
          inferPeriodFormatFromValue(grounding.periodCoverage.min) ?? "unknown"
        } ${grounding.periodCoverage.min} to ${grounding.periodCoverage.max} (the range of the package's finest-grained results; coarser-grained results may reach further — each metric states its own in get_metric_data)`,
    );
  }
  return sections;
}

// One prompt line per HMIS indicator: the facts the package declares for
// it, nothing for a fact it lacks, so a legacy package prints `id: label`.
function describeHmisIndicatorForPrompt(ind: RunHmisIndicator): string {
  const facts = [
    ...(ind.format_as ? [ind.format_as] : []),
    ...describeIndicatorFacts(ind),
  ];
  const factText = facts.length > 0 ? ` [${facts.join("; ")}]` : "";
  const formula = ind.expression ? ` = ${ind.expression}` : "";
  return `- ${ind.id}: ${ind.label}${factText}${formula}`;
}

// ── The package block: the package in view, its scope and its grounding ──
//
// The chat's per-turn consumer block for the results package the current
// view shows. It rides a message whenever its text is new to the
// conversation, so a reattach, a rescope or a scope edit puts the new package
// in front of the model once, on the message where it happened, and the
// system prompt stays instance level. Pure over its inputs: the caller
// resolves the package's label and date, the scope's display label and
// definition, and the authoring context's grounding.

const FAMILY_NAMES = { hmis: "HMIS", hfa: "HFA", iceh: "ICEH" } as const;

// One family's section of the scope: excluded, unlimited, or its limits.
function familyLine(
  family: keyof ScopeDefinition,
  definition: ScopeDefinition,
): string {
  const section = definition[family];
  const name = FAMILY_NAMES[family];
  if (!section.include) {
    return `- ${name}: excluded. Every ${name} table reads as empty and no ${name} module or metric is offered.`;
  }
  const limits = [
    "adminArea2" in section && section.adminArea2 !== null &&
    `admin area 2 "${section.adminArea2}"`,
    "years" in section && section.years !== null &&
    `years ${section.years.start} to ${section.years.end}`,
    "timePoints" in section && section.timePoints !== null &&
    `time points ${section.timePoints.join(", ")}`,
    section.modules !== null && `modules ${section.modules.join(", ")}`,
    section.indicators !== null &&
    `indicators ${section.indicators.join(", ")}`,
    "categories" in section && section.categories !== null &&
    `categories ${section.categories.join(", ")}`,
    "serviceCategories" in section && section.serviceCategories !== null &&
    `service categories ${section.serviceCategories.join(", ")}`,
  ].filter((limit) => typeof limit === "string");
  return limits.length === 0
    ? `- ${name}: included, no limits.`
    : `- ${name}: included, limited to ${limits.join("; ")}.`;
}

// What the scope limits, family by family, in words the model can act on: a
// figure it authors reads only rows inside these limits, so a filter outside
// them returns nothing.
function scopeLines(scope: PackageBlockScope | undefined): string[] {
  if (scope === undefined) return ["**Scope:** not listed"];
  return [
    `**Scope:** ${scope.label}`,
    "Every read returns only the rows inside this scope. Each dataset family has its own limits:",
    ...MODULE_FAMILY_ORDER.map((family) =>
      familyLine(family, scope.definition)
    ),
    "A limit applies to a table only when the table has a column for it; a table without one is returned whole, unless its module is outside its family's module list.",
  ];
}

export type PackageBlockScope = {
  // The display label ("All data" for the reserved scope): the caller
  // translates, this file does not.
  label: string;
  definition: ScopeDefinition;
};

export type PackageBlockInputs = {
  packageLabel: string;
  createdAt: string | null;
  // Undefined when the scopes list does not hold the pair's scope.
  scope: PackageBlockScope | undefined;
  grounding: PackageGrounding;
};

export function buildPackageBlock(inputs: PackageBlockInputs): string {
  const packageLine = `**Package:** ${inputs.packageLabel}${
    inputs.createdAt === null ? "" : ` (generated ${inputs.createdAt})`
  }`;
  return [
    "# Results package in view",
    "",
    "The current view shows one results package at one scope. Every metric read you make and every figure you author here resolves under this pair; you do not choose the package, and no tool takes one.",
    "",
    packageLine,
    ...scopeLines(inputs.scope),
    ...buildPackageGroundingSections(inputs.grounding),
  ].join("\n");
}

// ── Data coverage: the instance's facility registries ──

export function buildDataCoverageSections(
  instance: InstanceGrounding,
): string[] {
  const sections: string[] = [];
  if (instance.structure) {
    sections.push("");
    sections.push("**Data coverage:**");
    sections.push(
      `- ${instance.structure.hmis.facilities} HMIS facilities, ${instance.structure.hfa.facilities} HFA facilities`,
    );
    for (
      const [familyLabel, counts, familyDepth] of [
        [
          "HMIS",
          instance.structure.hmis,
          instance.structureSchemaHmis?.adminDepth,
        ],
        [
          "HFA",
          instance.structure.hfa,
          instance.structureSchemaHfa?.adminDepth,
        ],
      ] as const
    ) {
      if (counts.facilities === 0) continue;
      // Storage is always four levels: staging pads every level above the
      // family's depth with the leaf value, so a depth-2 registry's level-3
      // rows are a 1:1 mirror of its level-2 rows. Reporting them would tell
      // the copilot a level-2 registry has AA3s and invite breakdowns on a
      // column its results objects do not carry.
      const depth = familyDepth ?? 4;
      const parts: string[] = [];
      if (depth >= 2 && counts.adminArea2s > 0) {
        parts.push(`${counts.adminArea2s} admin area 2s`);
      }
      if (depth >= 3 && counts.adminArea3s > 0) {
        parts.push(`${counts.adminArea3s} admin area 3s`);
      }
      if (parts.length > 0) {
        sections.push(`- ${familyLabel} registry: ${parts.join(", ")}`);
      }
    }
  }
  return sections;
}

// ── The instance ai_context: what an admin wrote for the assistant ──

export function buildAiContextSections(aiContext: string): string[] {
  const trimmed = aiContext.trim();
  if (trimmed === "") return [];
  return ["", "# Additional Context", "", trimmed];
}

// ── Base instructions ──

// The core principles the chat adds to the shared ones. Each names something
// only the chat has: the ask_user_questions tool, and a turn loop that runs
// every call of one reply before it asks the model again. /mcp passes none,
// since its clients run their own loop.
export const CHAT_CORE_PRINCIPLES: readonly string[] = [
  "**Ask when uncertain** - Use the ask_user_questions tool to clarify preferences, choose between approaches, or confirm decisions before proceeding. Don't guess what the user wants when you can ask.",
  "**Put calls that do not depend on each other in one reply** - A reply can hold several tool calls: they run in order and each returns its own result. Send every read you need together, and every write that needs no other call's result together, rather than one call per reply: a turn has a limited number of replies. A call that needs another's result (a new slide's ID, a block ID) waits for that result.",
];

function getBaseInstructions(
  roleAndPurpose: string,
  extraCorePrinciples: readonly string[],
): string {
  const principles = [
    "**CRITICAL: Always read data before commenting** - Use get_metric_data to see actual data before making any claims",
    "**Never fabricate statistics** - Only report what you've verified from the data",
    "**Check every claim against the rows you were given, before you write it** - " +
    'A comparative or superlative ("the lowest", "the highest", "rose steadily") ' +
    "is a claim about EVERY row you were returned, not about " +
    "the rows you happened to notice: re-read them and name the row that actually wins, " +
    "and describe a series by its whole shape, so a dip or a plateau in the middle is " +
    "stated and not smoothed into a trend. A claim that a value is near, approaching " +
    "or short of a declared threshold band is checked against the band's own cutoffs, " +
    "printed with their operators in the Dimension Summary: a value already inside the " +
    'band is in it, not approaching it. A period the "Period coverage" line shows ' +
    "ending short of its unit is partial: say so wherever you use it, an endpoint " +
    'included ("2025 year-to-date, through April"), never as a finished period. And ' +
    "describe a change to a product only as the tool result reports it: if a result " +
    "does not say a thing changed, it did not, so never tell the user something drifted " +
    "from an earlier state, and never offer to restore a state no tool result shows.",
    "**Acknowledge limitations** - Be clear about data gaps or quality issues",
    "**Be concise** - Keep explanations actionable and to the point",
    ...extraCorePrinciples,
  ].map((p, i) => `${i + 1}. ${p}`).join("\n");
  return `
# Role and Purpose

${roleAndPurpose}

# Core Principles

${principles}

# Indicator Interpretation Framework

Before writing any interpretation, settle which way is good for the indicator.

**Use the declared direction first.** Every HMIS indicator declares "higher is better" or "lower is better" in the HMIS indicators list above and in get_metric_data's Dimension Summary, with its thresholds and target where it has them. That declaration is the instance's own reading of the indicator and overrides any guess from the name.

**Only where nothing is declared** (HFA and ICEH indicators, module metrics such as outlier, completeness or dropout rates), infer the direction from what the indicator measures:
- Service delivery and coverage (visits, deliveries, immunizations, family planning, skilled birth attendance): higher is better. Expected values: "surplus" = positive, "disruption" = concern.
- Mortality and adverse outcomes (maternal deaths, neonatal deaths, stillbirths) and quality failures (dropout, outlier, stockout rates): lower is better.

**Critical rule**: An increase in deaths is never an "improvement"; a decrease in service coverage is never "progress". Match your language to what the indicator measures.
`;
}

// ── The deck's and the report's editing briefs ──
// The per-view instructions live with the SPA (client/src/components/
// instance/copilot/build_system_prompt.ts); these two briefs are here because
// the server test suite pins them.

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
**Image:** { "type": "image", "imgFile": "...", "style": { "imgFit": "contain", "imgAlign": "center" } }, where imgFile is one of the instance's image assets, listed by get_image_assets

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

The deck editor shows the deck's slides in a rail with one slide open beside it. The view state names the open slide, or says there is none. An edit to the open slide shows on the canvas at once and saves automatically; an edit to any other slide is saved immediately. Every slide tool that names a slide takes its ID and works on any slide of the deck, open or not, so never ask the user to open, close or switch a slide or a view.

## Workflow

1. Call get_deck FIRST to understand the deck's structure
2. Read a slide with get_slides before your first change to it after a user message, and ask for every slide you need in one call. It shows each slide's content and block IDs (the open slide as the canvas shows it, unsaved changes included), each figure's full config and whether the slide's layout overflows its page
3. Until the user's next message, the result of your own write to a slide (creating it included) is its state. A write's result carries what the write left: the slide's block IDs, its layout, its page fit and the config of each figure the write built or changed. Never read a slide to confirm a write or to learn its block IDs. The exception is a copy made by duplicate_slides, whose result gives only the new slide IDs: read the copy with get_slides before your first change to it
4. Choose the right tool for the job:
   - **Change text, blocks or layout** (a cover's or section's fields, a content slide's header, a block's content, adding, removing, rearranging or resizing blocks) → update_slide
   - **Tweak an existing figure** (replicant, filters, disaggregation, period, captions; not the chart type) → update_figure (slideId + blockId)
   - **Rebuild a slide from scratch or change its type** → replace_slide (last resort)
   - **Change the deck's structure** → create_slide, delete_slides, duplicate_slides, move_slides
5. Call get_metric_data before creating any from_metric block, to check the data it needs is available
6. Filter a content slide's from_metric block to the indicators the slide's text names: an unfiltered multi-indicator metric draws one panel per indicator, and the slide's layout overflows the page`;
}

// Appended to the editing brief while the report is still untouched. Its
// text never changes, so it rides the conversation once; the moment the body
// holds anything the instructions drop it and the model edits directly.
const STARTING_A_REPORT =
  `## Starting this report: brief, sections, plan, then draft

This report is still EMPTY (a title at most). When the user asks you to write it (or to draft, start or fill it), do not draft straight away. Work through these steps:

1. **Brief.** Ask what the user's request leaves open, at most four questions, each with ask_user_questions (one call per question, one question at a time), skipping any the request already answers: who the report is for, how long it should be (a short brief of two to four pages, or a full report), which indicators, areas or period it should focus on, and, last, what the report should be called: the title on its cover, or on its first heading when it has no cover. Give each question your suggested answers as options, the one you recommend first; the user can always type their own instead. For the title, suggest two or three titles that fit the answers so far, and offer the report's current name first when it is not the default untitled name ("Untitled report" or its translation).
2. **Look at the data.** With the answers, call get_available_metrics, then get_metric_data for every candidate indicator and breakdown you need, ALL in one reply (several get_metric_data calls in the same message, not one per reply), so the sections and the plan rest on real numbers. A turn has a limited number of replies (counting the user's answers to your questions), and a full report needs most of them, so never spend one reply per read; the same goes for page templates (every layout in one get_page_template call). Do not write to the report yet.
3. **Sections.** Before any detailed plan, list in chat the sections you intend to write, each as its heading and one line on what it covers, in plain words (no metric ids, template names or other internal names). Then, in the same message, call ask_user_questions asking whether these are the right sections, with exactly these two options, labelled in the user's language: "These sections look good", "Add or remove sections". Then WAIT:
   - **These sections look good**: go to step 4.
   - **Add or remove sections**: ask which sections to add or remove, show the revised list and ask again the same way. Repeat until the user is happy.
   - **The user's own answer**: treat it as the additions and removals; show the revised list and ask again.
4. **Final plan.** For the agreed sections, propose the full plan in chat, not in the report. Write it for the person reading it, who knows their data but has never seen this report format or your tools: plain words, short lines. For each section give its heading, what it will say, the charts or tables it will show, described by what they show ("a line chart of reporting completeness for each indicator, 2022 to 2025", "a table comparing the regions"), and the headline numbers you found. Plan the report's designed pages as well (about one page in three for a full report, in the order "Composing a report" gives; one or two for a short brief), but describe each by what the reader will see: "a cover with the title beside a picture", "a summary page with the key numbers down the side", "a divider page that opens Part 1: Reporting completeness", "a one-page table scoring each region", "a numbered list of recommendations", "a closing page with how to cite the report". Never show the user the format's or the tools' own names: no metric ids or presets (such as m1-02-02 or completeness-timeseries), no block, template or layout names or syntax (such as \`:::steps\`, exec, opener, scorecard, layout=split), no page-fill percentages, no tool names. You choose those yourself when you write the draft. Then, in the same message, call ask_user_questions asking whether to write it, with exactly these three options, labelled in the user's language: "Yes, write it", "No", "Keep planning". Then WAIT:
   - **Yes, write it**: go to step 5.
   - **Keep planning**: ask what to change, revise the plan, show it again and ask again. Repeat as often as the user wants.
   - **No**: write nothing. Ask briefly what they would like to do instead.
   - **The user's own answer**: treat it as changes to the plan; revise, show it again and ask again.
5. **Draft.** Write the whole report, figures included, in ONE rewrite_report, following the approved plan, with the agreed title as the cover's title (or the first heading when there is no cover). Pass the plan's figures as \`newFigures\` and embed each at the column width, as \`![caption](figure:<key>)\` with no width, after its section's opening paragraph, never straight under the heading and never two in a row, and give each chart two or three paragraphs (about 120 words or more) that read it. Write the body ONCE: do not lay it out with get_report_pages first. rewrite_report lays the draft out itself and holds it rather than proposing it while it has page problems, and once with what each new figure shows. Then fix it with edit_report_draft, small exact replacements against the draft you wrote (move a paragraph, cut or add a sentence, correct a number), never by resending the body, which costs a whole report of writing each time. Fix every page it flags (SHORT, SPILL, UNDERFILLED, OVERFULL, STUB, SMALL, THIN, DETACHED, PLAIN, LONG BAND, BAND BEFORE TEMPLATE, SPARSE, REPEATED, figures back to back, long captions; a MUST FIX page, more than half empty, can never be waived), and rewrite any sentence whose numbers disagree with the data it reports for a figure (same period, same areas, same values). edit_report_draft proposes the draft once its pages are set; with no edits it proposes it as it stands. Do not ask the brief or the sections again once they have been agreed in this conversation.

If the user explicitly says to skip the questions or the plan ("just write it"), go straight to the draft.`;

// The page budget in the format guide is written for the house body. A
// report on a theme that sets its own (smaller) body holds more prose a
// page, so the brief says how to read the budget there, in numbers and
// without naming the theme (which the model never writes for).
function reportTypeSection(theme: string | undefined): string {
  if (theme === undefined) return "";
  const prose = fastrThemeProse(fastrThemeTokens(theme));
  if (prose === undefined) return "";
  const round = (n: number, to: number) => Math.round(n / to) * to;
  const times = prose.capacity.toFixed(1);
  return `

## This report's type

Its body is set smaller than the page budget in the format guide assumes, so a page holds about ${times} times the prose. Read the budget with these numbers instead: a line of prose is about ${
    Math.round(prose.wordsPerLine)
  } words and costs about ${
    prose.lineUnits.toFixed(1)
  } units (paragraph spacing included); a heading, a callout's lines, a table's rows, a steps block and every other block set in type cost about ${
    prose.typeScale.toFixed(1)
  } of what the guide gives; a figure, a cover and a page template cost what it says. Scale every word count in the guide with it: give each chart about ${
    round(120 * prose.capacity, 10)
  } words or more that read it, write paragraphs of about ${
    round(55 * prose.capacity, 10)
  } to ${
    round(75 * prose.capacity, 10)
  } words, and fill a page template's slots with about ${times} times the words its slot guidance names. Otherwise the pages come out thin and short.`;
}

export function getEditingReportInstructions(
  reportLabel: string,
  // The report still holds nothing anyone wrote (isUntouchedReport): asked
  // to write it, the model agrees a brief and an outline before drafting.
  // `theme`: the report's, for how its pages read the guide's page budget
  // (reportTypeSection).
  opts: { untouched?: boolean; theme?: string } = {},
): string {
  const common = `## How editing works

- Every TEXT edit you propose is STAGED as a diff the user accepts or rejects — nothing is applied silently. Make focused, well-scoped edits.
- **Figure edits are different from text edits.** update_report_figure applies straight to the live preview and saves — it is NOT staged as a diff (the figure's body token doesn't change). Body/text edits and figure inserts ARE staged for accept/reject.
- Prefer **rewrite_section** for targeted changes; use **replace_text** for small/sentence-level edits; use **rewrite_report** only for whole-document restructures.
- ALWAYS call get_report_editor first: it returns the current body, the format, and a headings index (each heading's 1-based line, level, and the exact line range of its section).
- You may only reference figure/image ids that already exist; do not invent embed ids. To add figures, either declare them in rewrite_report's \`newFigures\` (a whole draft and its figures in one change: the way to write a report) or use **insert_figure** to add one figure to a report that already exists.
- Every figure in this report resolves under the report's own results package and scope; you do not choose the package, and no tool takes one.`;
  // The design already exists as a real stylesheet the user picked, so the
  // model's job is to reach for the right BLOCK. Every instinct to write CSS
  // has to be shut down explicitly: the report has no <style> for it to land
  // in, and a hand-rolled <div> is unstyled markup.
  return `# Current View: Editing Report "${reportLabel}" (FASTR Markdown format)

The user is editing a long-form report written in **FASTR Markdown** — ordinary markdown plus a small set of \`:::\` blocks — with embedded live figures. The user hand-edits this document, so keep the source clean and readable.

**Whenever you write or restructure this report (rewrite_report, or a rewrite_section that adds new material), build it from the format's \`:::\` blocks** — open with a \`:::cover\` (choosing a \`layout\`), add a \`:::contents\` line when the report is long, mark the turning points with \`:::band\`, give a full report about one page template in three pages (eight to ten in a twenty-page report), and a short brief one or two, wherever you have the content to fill them, in the order the guide's reference shape gives (\`exec\` after the contents, an \`opener\` before each main part, \`summary\`, \`timeline\` and \`compare\` between the analysis sections, \`findings\` then \`scorecard\`, \`targets\`, \`method\`, and \`back\` as the last page; look them all up in ONE get_page_template call), and let the sections flow one after another down the pages with no \`:::pagebreak\` between them, so short sections share a page and every page but the last is full — with the shape the "Composing a report" guidance in rewrite_report's description gives. Do this on the first write, without being asked: a plain run of headings and paragraphs wastes the format. Write plain only when the user asks for something plain. A \`:::tiles\` row of \`:::stat\` blocks is NOT part of that default: add one only when the report genuinely rests on two to four separate headline numbers (see "Composing a report"), never by habit.
${opts.untouched ? `\n${STARTING_A_REPORT}\n` : ""}
${common}

## Writing FASTR Markdown for this report

- The format guide (every \`:::\` block, its attributes, the figure syntax, the page budget and how to compose a report) is in rewrite_report's description. Follow it for every tool that writes this report, rewrite_section and replace_text included.
- The report already looks designed: its theme supplies the typography, palette and every block's appearance, and the user can switch themes at any time. Writing CSS or raw layout HTML would not just be redundant, it would be INERT and would break that switch. (Which theme is in use is the user's business, not yours — never name one or write for one.)
- Use the blocks where they earn their place — a callout for a caveat or key finding, a tiles row of stats only for several separate headline numbers, columns to set commentary beside a figure, a page template wherever a section has the shape one is built for. Plain prose and lists are still the backbone of the document.
- **Sections** (rewrite_section, the headings index) are flat: a section runs from its \`#\` heading to the next heading of the same or higher level, and your newBody replaces that whole range starting with the heading. Only TOP-LEVEL headings are sections — a heading inside a \`:::\` block is not addressable, so keep headings outside blocks.
- For insert_figure, pass afterHeading so the figure lands in the right section.
- The report prints on pages, and the pages are the deliverable. rewrite_report lays a whole draft out itself and holds it while its pages have problems: fix a held draft with edit_report_draft, never by resending it. Before a rewrite_section that changes what a page holds, call get_report_pages with that \`sectionHeading\` and \`newBody\` (never the whole body as \`markdown\`) and fix every page it flags; the page budget is in the format guide above.${
    reportTypeSection(opts.theme)
  }`;
}
