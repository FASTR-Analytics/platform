import { getCountryLabel } from "../consts.ts";
import type { RunDataset } from "../types/run_datasets.ts";
import type { InstanceState } from "../types/instance_sse.ts";
import type { InstanceCalendar } from "../types/instance.ts";
import type { PeriodBounds } from "../types/presentation_objects.ts";
import type { RunHmisIndicator } from "../types/run_manifest.ts";
import { inferPeriodFormatFromValue } from "../types/_metric_installed.ts";
import { describeIndicatorFacts } from "./format_metric_data_for_ai.ts";
import type { InfoCatalogTopic } from "./info_catalog.ts";
import type { ScopeDefinition } from "../types/scope.ts";
import { MODULE_FAMILY_ORDER } from "../group_metrics.ts";

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
  // The get_info topics THIS surface exposes: the same list its
  // getSharedToolsForInfo was built with, so the prompt never names a topic
  // the tool would refuse.
  infoTopics: InfoCatalogTopic[];
  // "# Role and Purpose" body: what THIS surface's assistant is for.
  roleAndPurpose: string;
  // Core principles this surface adds after the four shared ones (the SPA
  // adds "ask when uncertain": the ask_user_questions tool exists only
  // there).
  extraCorePrinciples: string[];
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
  const referenceDocsSection = buildReferenceDocsSection(parts.infoTopics);
  const baseInstructions = getBaseInstructions(
    parts.roleAndPurpose,
    parts.extraCorePrinciples,
  );
  const toolsSection = parts.toolCatalog === undefined
    ? ""
    : `\n# Available Tools\n\n${parts.toolCatalog}\n`;
  return `${dateHeader}${parts.contextSection}${referenceDocsSection}${baseInstructions}${toolsSection}`;
}

// ── Reference documentation catalog ──

function buildReferenceDocsSection(topics: InfoCatalogTopic[]): string {
  if (topics.length === 0) return "";
  const sections: string[] = [];
  sections.push("# Reference documentation");
  sections.push("");
  sections.push(
    "Authoritative reference docs you can load on demand with the **get_info** tool. When a task relates to one of these topics, call get_info for that topic FIRST and follow it.",
  );
  sections.push("");
  for (const t of topics) {
    sections.push(`- **${t.topic}** — ${t.title}: ${t.description}`);
  }
  sections.push("");
  return sections.join("\n");
}

// ── Instance grounding: country, terminology, data sources ──

export function buildInstanceContextSections(
  instance: InstanceState,
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

export function buildDataCoverageSections(instance: InstanceState): string[] {
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

function getBaseInstructions(
  roleAndPurpose: string,
  extraCorePrinciples: string[],
): string {
  const principles = [
    "**CRITICAL: Always read data before commenting** - Use get_metric_data to see actual data before making any claims",
    "**Never fabricate statistics** - Only report what you've verified from the data",
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

// ── Report authoring brief ──
// The per-view instructions live with the SPA (client/src/components/
// instance/copilot/build_system_prompt.ts); the report EDITING brief stays here
// because the server test suite covers it.

// Appended to the editing brief while the report is still untouched. Its
// text never changes, so it rides the conversation once; the moment the body
// holds anything the instructions drop it and the model edits directly.
const STARTING_A_REPORT =
  `## Starting this report: brief, sections, plan, then draft

This report is still EMPTY (a title at most). When the user asks you to write it (or to draft, start or fill it), do not draft straight away. Work through these steps:

1. **Brief.** Ask what the user's request leaves open, at most four questions, each with ask_user_questions (one call per question, one question at a time), skipping any the request already answers: who the report is for, how long it should be (a short brief of two to four pages, or a full report), which indicators, areas or period it should focus on, and, last, what the report should be called: the title on its cover, or on its first heading when it has no cover. Give each question your suggested answers as options, the one you recommend first; the user can always type their own instead. For the title, suggest two or three titles that fit the answers so far, and offer the report's current name first when it is not the default untitled name ("Untitled report" or its translation).
2. **Look at the data.** With the answers, call get_available_metrics, then get_metric_data for the candidate indicators, so the sections and the plan rest on real numbers. Do not write to the report yet.
3. **Sections.** Before any detailed plan, list in chat the sections you intend to write, each as its heading and one line on what it covers. Then, in the same message, call ask_user_questions asking whether these are the right sections, with exactly these two options, labelled in the user's language: "These sections look good", "Add or remove sections". Then WAIT:
   - **These sections look good**: go to step 4.
   - **Add or remove sections**: ask which sections to add or remove, show the revised list and ask again the same way. Repeat until the user is happy.
   - **The user's own answer**: treat it as the additions and removals; show the revised list and ask again.
4. **Final plan.** For the agreed sections, propose the full plan in chat, not in the report: each section's heading, what it says, the indicators and figures it will use (by metric and preset), and the headline numbers you found. Then, in the same message, call ask_user_questions asking whether to write it, with exactly these three options, labelled in the user's language: "Yes, write it", "No", "Keep planning". Then WAIT:
   - **Yes, write it**: go to step 5.
   - **Keep planning**: ask what to change, revise the plan, show it again and ask again. Repeat as often as the user wants.
   - **No**: write nothing. Ask briefly what they would like to do instead.
   - **The user's own answer**: treat it as changes to the plan; revise, show it again and ask again.
5. **Draft.** Write the whole report in ONE rewrite_report (after checking it with get_report_pages), following the approved plan, with the agreed title as the cover's title (or the first heading when there is no cover). Once the user accepts it, add the plan's figures with insert_figure, each after its section's heading. Do not ask the brief or the sections again once they have been agreed in this conversation.

If the user explicitly says to skip the questions or the plan ("just write it"), go straight to the draft.`;

export function getEditingReportInstructions(
  reportLabel: string,
  // The report still holds nothing anyone wrote (isUntouchedReport): asked
  // to write it, the model agrees a brief and an outline before drafting.
  opts: { untouched?: boolean } = {},
): string {
  const common = `## How editing works

- Every TEXT edit you propose is STAGED as a diff the user accepts or rejects — nothing is applied silently. Make focused, well-scoped edits.
- **Figure edits are different from text edits.** update_report_figure applies straight to the live preview and saves — it is NOT staged as a diff (the figure's body token doesn't change). Body/text edits and figure inserts ARE staged for accept/reject.
- Prefer **rewrite_section** for targeted changes; use **replace_text** for small/sentence-level edits; use **rewrite_report** only for whole-document restructures.
- ALWAYS call get_report_editor first: it returns the current body, the format, and a headings index (each heading's 1-based line, level, and the exact line range of its section).
- You may only reference figure/image ids that already exist; do not invent embed ids. Use **insert_figure** to add a new figure from a metric plus one of its presets.
- Every figure in this report resolves under the report's own results package and scope; you do not choose the package, and no tool takes one.`;
  // The design already exists as a real stylesheet the user picked, so the
  // model's job is to reach for the right BLOCK. Every instinct to write CSS
  // has to be shut down explicitly: the report has no <style> for it to land
  // in, and a hand-rolled <div> is unstyled markup.
  return `# Current View: Editing Report "${reportLabel}" (FASTR Markdown format)

The user is editing a long-form report written in **FASTR Markdown** — ordinary markdown plus a small set of \`:::\` blocks — with embedded live figures. The user hand-edits this document, so keep the source clean and readable.

**Whenever you write or restructure this report (rewrite_report, or a rewrite_section that adds new material), build it from the format's \`:::\` blocks** — open with a \`:::cover\` (choosing a \`layout\`), add a \`:::contents\` line when the report is long, put the headline numbers in a \`:::tiles\` row of \`:::stat\` blocks, mark the turning points with \`:::band\` — with the shape the "Composing a report" guidance in rewrite_report's description gives. Do this on the first write, without being asked: a plain run of headings and paragraphs wastes the format. Write plain only when the user asks for something plain.
${opts.untouched ? `\n${STARTING_A_REPORT}\n` : ""}
${common}

## Writing FASTR Markdown for this report

- The format guide (every \`:::\` block, its attributes, the figure syntax, the page budget and how to compose a report) is in rewrite_report's description. Follow it for every tool that writes this report, rewrite_section and replace_text included.
- The report already looks designed: its theme supplies the typography, palette and every block's appearance, and the user can switch themes at any time. Writing CSS or raw layout HTML would not just be redundant, it would be INERT and would break that switch. (Which theme is in use is the user's business, not yours — never name one or write for one.)
- Use the blocks where they earn their place — a callout for a caveat or key finding, a tiles row of stats for headline numbers, columns to set commentary beside a figure. Plain prose and lists are still the backbone of the document.
- **Sections** (rewrite_section, the headings index) are flat: a section runs from its \`#\` heading to the next heading of the same or higher level, and your newBody replaces that whole range starting with the heading. Only TOP-LEVEL headings are sections — a heading inside a \`:::\` block is not addressable, so keep headings outside blocks.
- For insert_figure, pass afterHeading so the figure lands in the right section.
- The report prints on pages, and the pages are the deliverable. Before proposing a rewrite_report, or a rewrite_section that changes what a page holds, call get_report_pages with the body as it would stand (the current body from get_report_editor with your section swapped in, as \`markdown\`) and fix every page it flags; the page budget is in the format guide above.`;
}
