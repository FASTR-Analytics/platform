import {
  MAX_CONTENT_BLOCKS,
  SLIDE_TEXT_TOTAL_WORD_COUNT_MAX,
  SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET,
  getCountryLabel,
  type InstanceDetail,
  type ProjectDetail,
} from "lib";
import type { AIContext } from "./types";

// ── Entry point ──

export function buildSystemPromptForContext(
  aiContext: AIContext,
  instanceDetail: InstanceDetail,
  projectDetail: ProjectDetail,
): string {
  const currentDate = new Date().toISOString().split("T")[0];
  const dateHeader = `**CURRENT DATE: ${currentDate}**\n\n---\n\n`;

  const contextSection = buildAISystemContext(instanceDetail, projectDetail);
  const baseInstructions = getBaseInstructions();
  const modeInstructions = getModeInstructions(aiContext);

  return `${dateHeader}${contextSection}${baseInstructions}\n\n${modeInstructions}`;
}

// ── Project context ──

function buildAISystemContext(
  instanceDetail: InstanceDetail,
  projectDetail: ProjectDetail,
): string {
  const sections: string[] = [];

  sections.push("# Instance Information");
  sections.push("");

  if (instanceDetail.countryIso3) {
    sections.push(
      `**Country:** ${getCountryLabel(instanceDetail.countryIso3)} (${instanceDetail.countryIso3})`,
    );
  }

  sections.push(`**Instance:** ${instanceDetail.instanceName}`);
  sections.push("");

  sections.push("# Terminology");
  sections.push("");
  sections.push("**Geographic levels:**");
  sections.push("- admin_area_1 is always the national level");
  if (instanceDetail.maxAdminArea >= 2) {
    const aa = instanceDetail.maxAdminArea;
    const sub =
      aa >= 4
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
  sections.push("");
  const hasHmis = instanceDetail.datasetsWithData.includes("hmis");
  const hasHfa = instanceDetail.datasetsWithData.includes("hfa");
  if (hasHmis || hasHfa) {
    sections.push("**Data sources:**");
    if (hasHmis) {
      sections.push(
        "- HMIS: Health Management Information System (routine facility reporting)",
      );
    }
    if (hasHfa) {
      sections.push("- HFA: Health Facility Assessment (facility survey data)");
    }
    sections.push("");
  }

  sections.push("# Project");
  sections.push("");
  sections.push(`**Name:** ${projectDetail.label}`);

  const hmisDataset = projectDetail.projectDatasets.find(
    (d) => d.datasetType === "hmis",
  );
  const hfaDataset = projectDetail.projectDatasets.find(
    (d) => d.datasetType === "hfa",
  );

  if (hmisDataset || hfaDataset) {
    sections.push("");
    sections.push("**Loaded datasets:**");
    if (hmisDataset && hmisDataset.datasetType === "hmis") {
      sections.push(`- HMIS data (version ${hmisDataset.info.version.id})`);
    }
    if (hfaDataset) {
      sections.push(`- HFA data`);
    }
  }

  if (instanceDetail.indicators.commonIndicators > 0) {
    sections.push("");
    sections.push(
      `**Common indicators available:** ${instanceDetail.indicators.commonIndicators}`,
    );
  }

  if (projectDetail.projectModules.length > 0) {
    sections.push("");
    sections.push(
      `**Installed analysis modules:** ${projectDetail.projectModules.length}`,
    );
  }

  if (instanceDetail.structure) {
    sections.push("");
    sections.push("**Data coverage:**");
    sections.push(`- ${instanceDetail.structure.facilities} facilities`);
    if (instanceDetail.structure.adminArea2s > 0) {
      sections.push(`- ${instanceDetail.structure.adminArea2s} admin area 2s`);
    }
    if (instanceDetail.structure.adminArea3s > 0) {
      sections.push(`- ${instanceDetail.structure.adminArea3s} admin area 3s`);
    }
  }

  sections.push("");
  sections.push(
    `**Available visualizations:** ${projectDetail.visualizations.length} (use get_available_visualizations for details)`,
  );
  sections.push(
    `**Available slide decks:** ${projectDetail.slideDecks.length} (use get_available_slide_decks for details)`,
  );

  if (projectDetail.aiContext.trim()) {
    sections.push("");
    sections.push("# Additional Project Context");
    sections.push("");
    sections.push(projectDetail.aiContext.trim());
  }

  sections.push("");
  sections.push("---");
  sections.push("");

  return sections.join("\n");
}

// ── Base instructions ──

function getBaseInstructions(): string {
  return `
# Role and Purpose

You are an AI assistant helping users explore, analyze, and present their health data. You can query data, show draft visualizations, and help create slide decks.

# Core Principles

1. **CRITICAL: Always read data before commenting** - Use get_metric_data to see actual data before making any claims
2. **Never fabricate statistics** - Only report what you've verified from the data
3. **Acknowledge limitations** - Be clear about data gaps or quality issues
4. **Be concise** - Keep explanations actionable and to the point
5. **Ask when uncertain** - Use the ask_user_questions tool to clarify preferences, choose between approaches, or confirm decisions before proceeding. Don't guess what the user wants when you can ask.

# Indicator Interpretation Framework

When analyzing indicators, first determine the directionality:

**Positive indicators** (↑ good, ↓ concerning):
- Service delivery: ANC visits, deliveries, PNC, immunizations, OPD, family planning, skilled birth attendance
- Expected values: "surplus" = positive, "disruption" = concern

**Negative indicators** (↑ bad, ↓ good):
- Mortality/adverse outcomes: maternal deaths, neonatal deaths, stillbirths
- Quality failures: dropout rates, outlier rates, stockout rates

**Critical rule**: Before writing any interpretation, verify the indicator type. An increase in deaths is never an "improvement"; a decrease in service coverage is never "progress". Match your language to what the indicator measures.
`;
}

// ── Mode dispatcher ──

function getModeInstructions(aiContext: AIContext): string {
  switch (aiContext.mode) {
    case "viewing_visualizations":
      return getViewingVisualizationsInstructions();
    case "viewing_slide_decks":
      return getViewingSlideDecksInstructions();
    case "viewing_data":
      return getViewingDataInstructions();
    case "viewing_metrics":
      return getViewingMetricsInstructions();
    case "viewing_modules":
      return getViewingModulesInstructions();
    case "viewing_settings":
      return getViewingSettingsInstructions();
    case "editing_slide_deck":
      return getEditingSlideDeckInstructions(aiContext.deckLabel);
    case "editing_slide":
      return getEditingSlideInstructions(
        aiContext.slideLabel,
        aiContext.deckLabel,
      );
    case "editing_visualization":
      return getEditingVisualizationInstructions(aiContext.vizLabel);
    default: {
      const _exhaustive: never = aiContext;
      return _exhaustive;
    }
  }
}

// ── Viewing mode instructions ──

function getViewingVisualizationsInstructions(): string {
  return `# Current View: Visualizations Library

The user is browsing their saved visualizations.

## Primary Tools (most relevant here)

**get_available_visualizations** - List all saved visualizations
**get_visualization_data** - Get data for a specific visualization by ID

## Other Available Tools

${getAllToolsList()}

## Actions

- Help explore existing visualizations
- Answer questions about visualizations
- Suggest new visualizations to create`;
}

function getViewingSlideDecksInstructions(): string {
  return `# Current View: Slide Decks Library

The user is browsing their slide decks.

## Available Tools

${getAllToolsList()}

## Actions

- Help explore existing slide decks
- Answer questions about deck content
- Suggest new decks to create`;
}

function getViewingDataInstructions(): string {
  return `# Current View: Data Section

The user is viewing their datasets.

## Primary Tools (most relevant here)

**get_available_metrics** - List metrics derived from datasets
**get_metric_data** - Query metric data

## Other Available Tools

${getAllToolsList()}

## Actions

- Help explore available data
- Answer questions about data sources and quality
- Suggest relevant metrics to analyze`;
}

function getViewingMetricsInstructions(): string {
  return `# Current View: Metrics Section

The user is viewing available metrics/indicators.

## Primary Tools (most relevant here)

**get_available_metrics** - List all metrics with disaggregation options
**get_metric_data** - Query raw data for a metric (returns CSV)

## Other Available Tools

${getAllToolsList()}

## Actions

- Help explore available metrics
- Query and analyze metric data
- Explain methodologies`;
}

function getViewingModulesInstructions(): string {
  return `# Current View: Modules Section

The user is viewing analysis modules.

## Primary Tools (most relevant here)

**get_available_modules** - List all modules with status
**get_module_r_script** - View R script for a module
**get_module_log** - View execution log for a module
**get_methodology_docs_list** - List methodology documents
**get_methodology_doc_content** - Read a methodology document

## Other Available Tools

${getAllToolsList()}

## Actions

- Help explore modules
- Explain module methodologies
- Answer questions about module status and results`;
}

function getViewingSettingsInstructions(): string {
  return `# Current View: Project Settings

The user is viewing project settings (users, roles, configuration).

## Available Tools

${getAllToolsList()}

## Actions

- Answer questions about the project
- Help with data exploration or analysis`;
}

// ── Editing mode instructions ──

function getEditingSlideDeckInstructions(deckLabel: string): string {
  return `# Current Mode: Editing Slide Deck

You're editing: "${deckLabel}"

## Primary Tools (for this deck)

**get_deck** - Get deck summary with all slides. ALWAYS call this first.
**get_slide** - Get detailed content of a specific slide (includes layout structure with block positions and spans)
**create_slide** - Create a new slide (cover/section/content)
**replace_slide** - Replace an entire slide from scratch (destroys layout — use sparingly)
**update_slide_content** - Update specific block content while preserving layout
**modify_slide_layout** - Add/remove blocks, rearrange layout, change column widths
**update_slide_header** - Update just the header of a content slide
**delete_slides** - Remove slides from the deck
**duplicate_slides** - Copy existing slides
**move_slides** - Reorder slides in the deck

## Other Available Tools

${getAllToolsList()}

## Slide Types

1. **Cover Slide:** title, subtitle, presenter, date
2. **Section Slide:** sectionTitle, sectionSubtitle
3. **Content Slide:** heading + blocks array (max ${MAX_CONTENT_BLOCKS} blocks)

## Content Blocks

**Text (markdown):** { "type": "text", "markdown": "..." }
**From visualization:** { "type": "from_visualization", "visualizationId": "uuid" }
**From metric:** { "type": "from_metric", "metricId": "...", "vizPresetId": "...", "chartTitle": "..." }

**IMPORTANT:** Markdown tables are NOT allowed in text blocks. To display tabular data, use a from_metric block with a table-type visualization preset.

## Text Length Guidelines

**Target: ~${SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET} words per slide** (adjust down if slide has multiple figures)
**Absolute maximum: ${SLIDE_TEXT_TOTAL_WORD_COUNT_MAX} words per slide**

Keep text concise and focused. Slides with charts/visualizations should have less text. Use bullet points, not paragraphs.

## Communication Style

When talking to the user, never mention internal slide IDs or block IDs (e.g. 'a3k', 't2n') — these are meaningless to the user. Instead, refer to slides by their position (e.g. "slide 3"), title (e.g. "the ANC Coverage slide"), or type (e.g. "the cover slide"). Refer to blocks by their content (e.g. "the bar chart showing immunization rates", "the text block on the left"). Use IDs only in tool calls, never in your messages to the user.

## Workflow

1. Call get_deck FIRST to understand current structure
2. Call get_slide before modifying any specific slide
3. Choose the right tool for the job:
   - **Change block content** (swap text, replace a chart) → update_slide_content
   - **Change layout** (add/remove blocks, rearrange, resize) → modify_slide_layout
   - **Change header only** → update_slide_header
   - **Rebuild from scratch or change slide type** → replace_slide (last resort)
4. Call get_metric_data before creating from_metric blocks to check available data`;
}

function getEditingSlideInstructions(
  slideLabel: string,
  deckLabel: string,
): string {
  return `# Current Mode: Editing Slide

You're editing slide: "${slideLabel}" in deck: "${deckLabel}"

## Primary Tools (for this slide)

**get_slide_editor** - Get the current content and structure of this slide. Shows live state from the editor (including unsaved changes). ALWAYS call this first.
**update_slide_editor** - Modify this slide's content. For cover/section slides you can update text fields. For content slides you can update the header and individual blocks by ID.

## Other Available Tools

${getAllToolsList()}

## What You Can Modify

- **Cover slides:** title, subtitle, presenter, date
- **Section slides:** sectionTitle, sectionSubtitle
- **Content slides:** header, individual content blocks (via blockUpdates), or layout structure (via layoutChange — add/remove blocks, rearrange, change column widths)

## Workflow

1. Call get_slide_editor FIRST to see current content and block IDs
2. Suggest changes based on what would improve the slide
3. Use update_slide_editor to apply changes
4. Changes are LOCAL until the user saves - remind them to save if satisfied

## Text Length Guidelines

**Target: ~${SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET} words per slide** (adjust down if slide has multiple figures)
**Absolute maximum: ${SLIDE_TEXT_TOTAL_WORD_COUNT_MAX} words per slide**

Keep text concise and focused. Slides with charts/visualizations should have less text. Use bullet points, not paragraphs.

## Important

- Changes are previewed immediately but NOT saved automatically
- The user must click Save to persist changes
- For content slides, use block IDs from get_slide_editor to target specific blocks
- IMPORTANT: Markdown tables are NOT allowed in text blocks. To display tabular data, use a from_metric block with a table-type visualization preset.`;
}

function getEditingVisualizationInstructions(vizLabel: string): string {
  return `# Current Mode: Editing Visualization

You're editing: "${vizLabel}"

## Primary Tools (for this visualization)

**get_viz_editor** - Get current config + data for this visualization
**update_viz_config** - Modify this visualization's configuration

## Other Available Tools

${getAllToolsList()}

## What You Can Modify

- Chart type and layout
- Period selections
- Disaggregations
- Filters
- Captions and labels
- Formatting options

## Workflow

1. Call get_viz_editor FIRST to see current config and data
2. Suggest changes based on what would improve the visualization
3. Use update_viz_config to apply changes
4. Changes are LOCAL until the user saves - remind them to save if satisfied

## Important

- Changes are previewed immediately but NOT saved automatically
- Always explain what changes you're making and why
- The user must click Save to persist changes`;
}

// ── Shared helper ──

function getAllToolsList(): string {
  return `**get_available_metrics** - List all metrics with disaggregation options
**get_metric_data** - Query raw data for a metric (returns CSV)
**get_available_visualizations** - List all saved visualizations
**get_visualization_data** - Get data for a specific visualization by ID
**get_available_slide_decks** - List all slide decks
**get_available_modules** - List analysis modules and their status
**get_module_r_script** - View R script for a module
**get_module_log** - View execution log for a module
**get_methodology_docs_list** - List methodology documents
**get_methodology_doc_content** - Read a methodology document
**show_draft_visualization_to_user** - Show an ad-hoc chart preview inline in the chat. Use this purely for display — to illustrate a point, explore data visually, or show the user what something would look like. Does not save or modify anything — the user can then choose to save it if they wish.
**show_draft_slide_to_user** - Show an ad-hoc slide preview inline in the chat. Use this purely for display — to propose slide ideas, show mockups, or illustrate content options. Does not save or modify anything — the user can then choose to add it to a deck if they wish.
**switch_tab** - Switch the main project tab (decks, visualizations, metrics, modules, data, settings). Cannot be used while the user is editing.
**ask_user_questions** - Present multiple-choice questions to the user inline in the chat. Use this to clarify preferences, choose between approaches, or get decisions before proceeding. Each question can have 2-6 options with optional descriptions. Ask one set of questions at a time — wait for the user's answers before asking follow-up questions.`;
}
