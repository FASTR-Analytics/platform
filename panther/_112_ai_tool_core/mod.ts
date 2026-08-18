// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    AI TOOL CORE (Solid-free)                                               //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////
//
// The tool-authoring contract (createAITool, approval, the headless
// eligibility helper), the view/registry TYPE layer, the derived tool
// catalog, and the MCP server capability. Hoisted from _305_ai (2026-08-06,
// REVIEW_MCP_HOST_ARCHITECTURE.md ruling §6) so consumer server/lib tiers can
// import it under plain Deno: runtime deps are zod + _110_ai_types only;
// Solid appears as type-only imports and compiles away. _305_ai re-imports
// this module via its deps.ts — the mod.ui.ts barrel surface is unchanged.

export { AIToolFailure, toolThrowToResultParts } from "./tool_failure.ts";
export {
  aiToolFactory,
  buildAITool,
  createAITool,
  getHeadlessCapability,
} from "./tool_helpers.ts";
export { defineAIViews, resolveViewLabel, view } from "./view_types.ts";
export { buildToolCatalog } from "./tool_catalog.ts";
export {
  buildMCPServerCore,
  createMCPServer,
  validateMCPServerConfig,
} from "./mcp_server.ts";
export { MCPRequestError } from "./mcp_types.ts";
export { bindAITool, scopeAITool } from "./scope_ai_tool.ts";
export type { ScopeAIToolOptions } from "./scope_ai_tool.ts";

export type {
  AIToolApprovalConfig,
  AIToolKind,
  AIToolWithMetadata,
  ApprovalPolicy,
  CreateAIToolConfig,
  CreateAIToolConfigCommon,
  CreateViewAIToolConfig,
  ErasedApprovalConfig,
  ProposalPreview,
  ProposalResult,
  ToolUIMetadata,
  ViewAIToolApprovalConfig,
} from "./tool_helpers.ts";
export type {
  AIView,
  AIViewContext,
  AIViewDefinition,
  AIViewParams,
  AIViewRegistry,
  AIViewState,
  AIViewStateFor,
  AIViewVoidKeys,
  AnyAIView,
  SetViewArgs,
} from "./view_types.ts";
export type {
  CreateMCPServerConfig,
  MCPApprovalMode,
  MCPCallOutcome,
  MCPConnection,
  MCPElicitDecision,
  MCPPromptConfig,
  MCPResourceConfig,
  MCPServer,
  MCPServerCore,
  MCPToolDef,
  MCPToolsContext,
  MCPTransport,
} from "./mcp_types.ts";
