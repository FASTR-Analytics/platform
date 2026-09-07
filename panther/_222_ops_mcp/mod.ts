// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    OPS MCP DOOR (Deno server-side)                                         //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////
//
// The headless door for a _114 ops registry: one call mounts every
// headless-exposed op as an MCP tool over _220's streamable-HTTP handler,
// with auth from a _113 identity provider, elicit-mode approval, and the
// approval-exempt list derived from the registry.

export { createOpMCPHandler } from "./op_mcp_handler.ts";
export type { OpMCPHandlerConfig } from "./op_mcp_handler.ts";
