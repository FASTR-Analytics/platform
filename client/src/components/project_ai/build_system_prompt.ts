import { MAX_CONTENT_BLOCKS, type InstanceDetail, type ProjectDetail } from "lib";
import type { AIContext } from "./types";

export function buildSystemPromptForContext(
  aiContext: AIContext,
  instanceDetail: InstanceDetail,
  projectDetail: ProjectDetail
): string {
  const contextSection = buildAISystemContext(instanceDetail, projectDetail);
  const baseInstructions = getBaseInstructions();
  const modeInstructions = getModeInstructions(aiContext);

  return `${contextSection}${baseInstructions}\n\n${modeInstructions}`;
}

function getAllToolsList(): string {
  return `**get_available_metrics** - List all metrics with disaggregation options
**get_metric_data** - Query raw data for a metric (returns CSV)
**get_available_visualizations** - List all saved visualizations
**get_visualization_data** - Get data for a specific visualization by ID
**get_available_modules** - List analysis modules and their status
**get_module_r_script** - View R script for a module
**get_module_log** - View execution log for a module
**get_methodology_docs_list** - List methodology documents
**get_methodology_doc_content** - Read a methodology document
**show_draft_visualization_to_user** - Show an ad-hoc chart preview inline in the chat. Use this purely for display — to illustrate a point, explore data visually, or show the user what something would look like. Does not save or modify anything — the user can then choose to save it if they wish.
**show_draft_slide_to_user** - Show an ad-hoc slide preview inline in the chat. Use this purely for display — to propose slide ideas, show mockups, or illustrate content options. Does not save or modify anything — the user can then choose to add it to a deck if they wish.`;
}

function getBaseInstructions(): string {
  return `# Role and Purpose

You are an AI assistant helping users explore, analyze, and present their health data. You can query data, show draft visualizations, and help create slide decks.

# Core Principles

1. **CRITICAL: Always read data before commenting** - Use get_metric_data to see actual data before making any claims
2. **Never fabricate statistics** - Only report what you've verified from the data
3. **Acknowledge limitations** - Be clear about data gaps or quality issues
4. **Be concise** - Keep explanations actionable and to the point`;
}

function getModeInstructions(aiContext: AIContext): string {
  switch (aiContext.mode) {
    // Viewing modes
    case "viewing_visualizations":
      return getViewingVisualizationsInstructions();

    case "viewing_slide_decks":
      return getViewingSlideDecksInstructions();

    case "viewing_reports":
      return getViewingReportsInstructions();

    case "viewing_data":
      return getViewingDataInstructions();

    case "viewing_metrics":
      return getViewingMetricsInstructions();

    case "viewing_modules":
      return getViewingModulesInstructions();

    // Editing modes
    case "editing_slide_deck":
      return getEditingSlideDeckInstructions(aiContext.deckLabel);

    case "editing_visualization":
      return getEditingVisualizationInstructions(aiContext.vizLabel);

    case "editing_report":
      return getEditingReportInstructions(aiContext.reportLabel);
  }
}

// Viewing mode instructions
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

function getViewingReportsInstructions(): string {
  return `# Current View: Reports Library

The user is browsing their reports.

## Available Tools

${getAllToolsList()}

## Actions

- Help explore existing reports
- Answer questions about report content and data`;
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

// Editing mode instructions
function getEditingSlideDeckInstructions(deckLabel: string): string {
  return `# Current Mode: Editing Slide Deck

You're editing: "${deckLabel}"

## Primary Tools (for this deck)

**get_deck** - Get deck summary with all slides. ALWAYS call this first.
**get_slide** - Get detailed content of a specific slide
**create_slide** - Create a new slide (cover/section/content)
**replace_slide** - Replace an entire slide
**update_slide_content** - Update specific blocks within a slide
**update_slide_heading** - Update just the heading of a slide
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

**Text (markdown):** { "type": "text", "text": "..." }
**From visualization:** { "type": "from_visualization", "visualizationId": "uuid" }
**From metric:** { "type": "from_metric", "metricQuery": {...}, "chartType": "bar|line|table" }

**IMPORTANT:** No markdown tables - use from_metric with chartType='table' instead.

## Communication Style

When talking to the user, never mention internal slide IDs or block IDs (e.g. 'a3k', 't2n') — these are meaningless to the user. Instead, refer to slides by their position (e.g. "slide 3"), title (e.g. "the ANC Coverage slide"), or type (e.g. "the cover slide"). Refer to blocks by their content (e.g. "the bar chart showing immunization rates", "the text block on the left"). Use IDs only in tool calls, never in your messages to the user.

## Workflow

1. Call get_deck FIRST to understand current structure
2. Call get_slide before modifying any specific slide
3. Use targeted updates (update_slide_content) over full replacements when possible
4. Call get_metric_data before creating from_metric blocks to check available data`;
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

function getEditingReportInstructions(reportLabel: string): string {
  return `# Current Mode: Editing Report

You're editing: "${reportLabel}"

## Available Tools

${getAllToolsList()}

## Actions

- Query underlying data for visualizations in the report
- Explain methodology and interpretation
- Answer questions about the data`;
}

function buildAISystemContext(
  instanceDetail: InstanceDetail,
  projectDetail: ProjectDetail,
): string {
  const sections: string[] = [];

  // Instance information
  sections.push("# Instance Information");
  sections.push("");

  if (instanceDetail.countryIso3) {
    sections.push(`**Country:** ${instanceDetail.countryIso3}`);
  }

  sections.push(`**Instance:** ${instanceDetail.instanceName}`);
  sections.push("");

  // Terminology
  sections.push("# Terminology");
  sections.push("");
  sections.push("**Geographic levels:**");
  sections.push("- admin_area_1: National level");
  sections.push("- admin_area_2: Regional/provincial level (e.g., districts, regions)");
  sections.push("- admin_area_3: Sub-district level (e.g., zones, sub-districts)");
  sections.push("- admin_area_4: Facility catchment level (e.g., woredas, communes)");
  sections.push("");
  sections.push("**Data sources:**");
  sections.push("- HMIS: Health Management Information System (routine facility reporting)");
  sections.push("- HFA: Health Facility Assessment (facility survey data)");
  sections.push("");

  // Project information
  sections.push("# Project");
  sections.push("");
  sections.push(`**Name:** ${projectDetail.label}`);

  // Datasets
  const hmisDataset = projectDetail.projectDatasets.find(d => d.datasetType === "hmis");
  const hfaDataset = projectDetail.projectDatasets.find(d => d.datasetType === "hfa");

  if (hmisDataset || hfaDataset) {
    sections.push("");
    sections.push("**Loaded datasets:**");
    if (hmisDataset && hmisDataset.datasetType === "hmis") {
      sections.push(`- HMIS data (version ${hmisDataset.info.version})`);
    }
    if (hfaDataset) {
      sections.push(`- HFA data`);
    }
  }

  // Indicators
  if (instanceDetail.indicators.commonIndicators > 0) {
    sections.push("");
    sections.push(`**Common indicators available:** ${instanceDetail.indicators.commonIndicators}`);
  }

  // Modules
  if (projectDetail.projectModules.length > 0) {
    sections.push("");
    sections.push(`**Installed analysis modules:** ${projectDetail.projectModules.length}`);
  }

  // Structure
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

  // Available visualizations
  sections.push("");
  sections.push(`**Available visualizations:** ${projectDetail.visualizations.length}`);
  if (projectDetail.visualizations.length > 0) {
    for (const viz of projectDetail.visualizations.slice(0, 10)) {
      sections.push(`  - ${viz.label} (${viz.id})`);
    }
    if (projectDetail.visualizations.length > 10) {
      sections.push(`  ... and ${projectDetail.visualizations.length - 10} more`);
    }
  }

  // Available slide decks
  sections.push("");
  sections.push(`**Available slide decks:** ${projectDetail.slideDecks.length}`);
  if (projectDetail.slideDecks.length > 0) {
    for (const deck of projectDetail.slideDecks) {
      sections.push(`  - ${deck.label} (${deck.id})`);
    }
  }

  // Available reports
  sections.push("");
  sections.push(`**Available reports:** ${projectDetail.reports.length}`);
  if (projectDetail.reports.length > 0) {
    for (const report of projectDetail.reports) {
      sections.push(`  - ${report.label} (${report.id})`);
    }
  }

  // User-provided custom context
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
