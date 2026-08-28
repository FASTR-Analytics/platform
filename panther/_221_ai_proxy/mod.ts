// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    AI PROXY (Deno server-side)                                             //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////
//
// A guarded pass-through to the Anthropic API with the server-held key and
// the one fleet-wide request sanitizer for the current model surface.

export { createAIProxyHandler } from "./ai_proxy_handler.ts";
export type { AIProxyHandlerConfig } from "./ai_proxy_handler.ts";
