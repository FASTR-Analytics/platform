// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AIToolWithMetadata, AnyAITool } from "./tool_helpers.ts";

////////////////////////////////////////////////////////////////////////////////
// DERIVED TOOL CATALOG
////////////////////////////////////////////////////////////////////////////////
//
// Renders the registered tools' REAL names and descriptions as markdown for
// prompt composition — the output can never drift from the registry because
// it is the registry. Descriptions already carry the static
// availability hints createAITool appends, so per-tool view annotations
// ride along.
//
// Each tool renders as exactly ONE bullet: description newlines collapse to
// spaces (the digest-bullet discipline) — the API's tools array keeps the
// full-fidelity description; the catalog buys organization, not fidelity.

function collapseToSingleLine(text: string): string {
  return text.replace(/\s*\n\s*/g, " ");
}

function bullet(tool: AIToolWithMetadata<unknown>): string {
  return `- **${tool.sdkTool.name}**: ${
    collapseToSingleLine(tool.sdkTool.description)
  }`;
}

export function buildToolCatalog(tools: AnyAITool[]): string {
  return tools.map(bullet).join("\n");
}
