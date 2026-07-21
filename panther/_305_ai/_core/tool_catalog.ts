// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AIToolWithMetadata } from "./tool_helpers.ts";

////////////////////////////////////////////////////////////////////////////////
// DERIVED TOOL CATALOG (Phase 5, Feature 5)
////////////////////////////////////////////////////////////////////////////////
//
// Renders the registered tools' REAL names and descriptions as markdown for
// prompt composition — the output can never drift from the registry because
// it is the registry (PLAN_AI_VIEWS_AND_APPROVAL Feature 5, replacing every
// hand-maintained prose tool list). Descriptions already carry the static
// availability hints createAITool appends, so per-tool view annotations
// ride along.
//
// CACHE RULE (stated in the plan): a call composed into the `system`
// accessor must OMIT currentView. Without a view the output is byte-stable
// (input order, static descriptions), so the system cache breakpoint keeps
// hitting; with a view the catalog regroups per navigation, and since
// system() is re-read every request, that busts the system cache on every
// view change. The view-grouped variant is for per-send content only
// (ephemeral sections or a "manual" promptSection composition).
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

export function buildToolCatalog(
  // deno-lint-ignore no-explicit-any
  tools: AIToolWithMetadata<any>[],
  currentView?: { id: string } | null,
): string {
  if (tools.length === 0) return "";
  if (!currentView) {
    return tools.map(bullet).join("\n");
  }
  const primary = tools.filter((t) =>
    t.metadata.availableIn?.includes(currentView.id)
  );
  const other = tools.filter((t) => !primary.includes(t));
  const sections: string[] = [];
  if (primary.length > 0) {
    sections.push(
      `Primary tools (available in the current view):\n${
        primary.map(bullet).join("\n")
      }`,
    );
  }
  if (other.length > 0) {
    sections.push(`Other tools:\n${other.map(bullet).join("\n")}`);
  }
  return sections.join("\n\n");
}
