// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    OPS KERNEL (browser-compatible, framework-free)                         //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////
//
// The panterra operations layer: one declaration per operation (schema +
// kind + auth policy + exposure + logging), validated at boot, dispatched
// through a single authorize → validate → execute → log → emit sequence,
// and projected to every surface — the RPC HTTP door (POST /api/op/<name>),
// the generated typed client, the in-app AI tools (_112 lifecycle), and the
// derived headless/MCP tools. Designed in the panterra repo
// (PLAN_OPS_KERNEL.md there; requirements R1–R14, wire = decision 15).

export { defineOps } from "./define.ts";
export { createOpKernel } from "./kernel.ts";
export { createOpHttpHandler } from "./http.ts";
export { callWithApproval, createOpClient, createOpRunner } from "./client.ts";
export { createOpEventHub, createOpEventsHandler } from "./notify.ts";
export { connectOpEvents } from "./notify_client.ts";
export {
  opsApprovalExempt,
  opsToAITools,
  opsToMCPTools,
} from "./projections.ts";
export { OpFailure } from "./types.ts";
export { zOpCatalogEntry, zOpProvenanceRecord } from "./schemas.ts";

export type {
  OpDispatchOpts,
  OpKernel,
  OpKernelConfig,
  OpOffContractRecord,
} from "./kernel.ts";
export type { OpHttpHandlerConfig } from "./http.ts";
export type {
  OpEventHub,
  OpEventsHandlerConfig,
  OpEventSubscriber,
} from "./notify.ts";
export type {
  OpEventsConnection,
  OpEventsConnectionConfig,
  OpEventsListener,
} from "./notify_client.ts";
export type {
  NavOpImpls,
  OpApprovalFlowData,
  OpCallOpts,
  OpClient,
  OpClientConfig,
  OpClientMethod,
  OpRunner,
} from "./client.ts";
export type { RunOpFn } from "./projections.ts";
export type {
  NavOpNameOf,
  OpApprovalCallData,
  OpArgsOf,
  OpCatalogEntry,
  OpChangeEvent,
  OpContract,
  OpCtx,
  OpExposure,
  OpImplFor,
  OpImpls,
  OpKind,
  OpOutcome,
  OpOutputOf,
  OpProvenanceOutcome,
  OpProvenanceRecord,
  OpRegistry,
  OpScoped,
  OpSurface,
  ServerOpNameOf,
} from "./types.ts";
