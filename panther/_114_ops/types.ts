// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The operation contract: one declaration per operation, shared verbatim by
// every surface (HTTP door, typed client, UI form, AI tool, MCP catalog,
// provenance). The declaration is browser-safe data — zod schema + policy
// fields — and the op's NAME is its registry key: there is no second
// identifier anywhere for a wire path, tool name, or log record to drift
// from. Policy fields are required; there is no "omitted means default open"
// (the wb-fastr survey's 85 unlogged guarded routes and one unguarded route
// were accidents of per-site opt-in).

import type {
  GuardDecision,
  ProposalPreview,
  QueryState,
  zType,
} from "./deps.ts";

export type OpKind = "read" | "write" | "nav";

// Where a call entered. ui/ai arrive through the HTTP door (the client
// declares ai via the X-Op-Surface header); mcp is set by the MCP surface
// itself. PROVENANCE-ONLY, never policy: ui/ai is client-declared and
// therefore forgeable — nothing may branch on it.
export type OpSurface = "ui" | "ai" | "mcp";

export type OpExposure = {
  // Render as a human control.
  ui: boolean;
  // Project as an in-app AI tool.
  ai: boolean;
  // Expose on headless surfaces (MCP). Exclusion must carry its reason — a
  // visible choice, not an omission. The headless catalog is
  // DERIVED from these declarations; there is no separate allowlist to drift.
  headless: true | { excluded: string };
};

export type OpContract<
  TAuth extends string = string,
  TInput extends zType.ZodType = zType.ZodType,
  TOutput extends zType.ZodType = zType.ZodType,
  TResource extends string = string,
> = {
  kind: OpKind;
  // Human label (buttons, catalog).
  title: string;
  // Model-facing description (AI tool, MCP tools/list) and UI tooltip.
  description: string;
  // The keystone schema: validates the HTTP body, the UI form, and the AI
  // tool input — one object, so divergence is unwritable. Must accept
  // unknown keys when exposure.ai is set (createAITool's construction guard).
  input: TInput;
  // The op's result shape as DATA, same standing as `input`: it types the
  // impl and client by inference, serializes into the catalog and the MCP
  // outputSchema, and backs the kernel's validateOutputs conformance check.
  // Required on read/write ops (boot-enforced; without it the impl types as
  // unimplementable). Nav ops declare none — navigation has no server
  // result (boot refuses one).
  output?: TOutput;
  // The app's policy vocabulary as data; mapped to _113 guards at kernel
  // boot, which fails when a value has no guard. Judges the IDENTITY alone,
  // before validation — an unprovisioned identity never sees validation
  // feedback.
  auth: TAuth;
  // The app's RESOURCE policy vocabulary as data ("may this identity touch
  // THIS row"), mapped to arg-aware guards at boot. The resource a call
  // touches is resolved per op by the impl's `resource` resolver after
  // validation (an input may carry only an opaque id — only the impl can
  // name what it belongs to); the guard then judges identity + resource.
  // Optional because not every op has a resource (listing, creating, the
  // catalog); when declared, the resolver is required (boot-enforced).
  resource?: TResource;
  exposure: OpExposure;
  // Confirm-before-apply via _112's propose → preview → commit lifecycle.
  // Writes only; the impl must supply `preview`.
  approval?: true;
  // A write reachable by AI or headless surfaces without approval must say
  // why: the boot check refuses a bare flagless write.
  approvalExempt?: string;
  // Emits _111 QueryState frames over NDJSON through the same authorized,
  // logged dispatch. Reads only.
  streaming?: true;
  // Input fields replaced with "[redacted]" in provenance records. Declared
  // per field on the schema it protects — never guessed from key names.
  redact?: readonly string[];
  // The scope KIND this write's change event carries (e.g. "project").
  // The declaration is data (catalog-visible); the VALUE comes
  // from the impl, which returns { scope, result } (OpScoped) — only the
  // impl authoritatively knows the affected scope (a delete's input may
  // carry just an id). Writes only; boot refuses it elsewhere.
  scope?: string;
};

export type OpRegistry<
  TAuth extends string = string,
  TResource extends string = string,
> = Record<
  string,
  // deno-lint-ignore no-explicit-any
  OpContract<TAuth, zType.ZodType<any>, zType.ZodType<any>, TResource>
>;

export type OpArgsOf<C extends OpContract> = zType.infer<C["input"]>;

export type OpOutputOf<C extends OpContract> = C["output"] extends zType.ZodType
  ? zType.infer<C["output"]>
  : never;

export type ServerOpNameOf<TReg extends OpRegistry> = {
  [K in keyof TReg & string]: TReg[K]["kind"] extends "nav" ? never : K;
}[keyof TReg & string];

export type NavOpNameOf<TReg extends OpRegistry> = {
  [K in keyof TReg & string]: TReg[K]["kind"] extends "nav" ? K : never;
}[keyof TReg & string];

// What the kernel hands an impl: validated args plus this. Impls never see a
// Request, a header, or a raw body — identity arrives already resolved
// and args already validated.
export type OpCtx<TIdentity> = {
  identity: TIdentity;
  surface: OpSurface;
};

// What preview/execute receive: the base ctx plus the resolved resource
// exactly when the op declares one — resolved ONCE (by the impl's resolver,
// before the resource guard), never re-derived, and typed present so an impl
// needs no non-null assertion.
export type OpCtxFor<C extends OpContract, TIdentity> =
  & OpCtx<TIdentity>
  & (C["resource"] extends string ? { resource: string }
    : { resource?: never });

// A resource guard judges an identity AGAINST a resolved resource (the row,
// project, document — whatever the impl's resolver named). Same decision
// contract as _113's Guard: deny with a readable reason, throw only for
// "cannot judge" (storage down → 503). Admin overrides and resource-state
// denials (a locked project) are the guard's business — app policy, never
// the kernel's.
export type OpResourceGuard<TIdentity> = (
  identity: TIdentity,
  resource: string,
) => GuardDecision | Promise<GuardDecision>;

// What a scoped write's impl resolves to: the result plus the scope value
// its change event carries. The wire never sees this wrapper — the kernel
// unwraps before responding.
export type OpScoped<T> = { scope: string; result: T };

type OpExecuteValue<C extends OpContract> = C["scope"] extends string
  ? OpScoped<OpOutputOf<C>>
  : OpOutputOf<C>;

// Impl shape per contract: streaming ops yield frames; approval ops must
// supply the read-only preview (same trust contract as _112's "propose must
// be read-only"); scoped writes resolve to { scope, result } (the same
// conditional-type enforcement as the preview — forgetting the scope is a
// compile error, never a silently global event); ops declaring a resource
// policy must supply the resolver (validated args → the resource the call
// touches; may look storage up; throws land in the failed funnel);
// everything else executes to a value. Impls THROW on failure — the kernel
// owns outcome mapping; OpFailure marks a message as wire-safe, anything
// else reaches the wire as generic text.
export type OpImplFor<C extends OpContract, TIdentity> =
  & (C["resource"] extends string ? {
      resource: (
        args: OpArgsOf<C>,
        ctx: OpCtx<TIdentity>,
      ) => string | Promise<string>;
    }
    : { resource?: never })
  & (C["streaming"] extends true ? {
      execute: (
        args: OpArgsOf<C>,
        ctx: OpCtxFor<C, TIdentity>,
      ) => AsyncIterable<QueryState<OpOutputOf<C>>>;
    }
    : C["approval"] extends true ? {
        preview: (
          args: OpArgsOf<C>,
          ctx: OpCtxFor<C, TIdentity>,
        ) => ProposalPreview | Promise<ProposalPreview>;
        execute: (
          args: OpArgsOf<C>,
          ctx: OpCtxFor<C, TIdentity>,
        ) => OpExecuteValue<C> | Promise<OpExecuteValue<C>>;
      }
    : {
      preview?: never;
      execute: (
        args: OpArgsOf<C>,
        ctx: OpCtxFor<C, TIdentity>,
      ) => OpExecuteValue<C> | Promise<OpExecuteValue<C>>;
    });

// The impl map is keyed by the registry's server ops: a missing impl, an
// orphan impl, or an impl for a nav op is a TYPE error here, and the kernel
// re-checks at boot for erased callers.
export type OpImpls<TReg extends OpRegistry, TIdentity> = {
  [K in ServerOpNameOf<TReg>]: OpImplFor<TReg[K], TIdentity>;
};

// One record per ATTEMPTED op, written by dispatch — denials and rejected
// input included. args are the VALIDATED args after redaction
// and truncation; identity denials and invalid records carry no args
// (nothing unvalidated is ever recorded), while a RESOURCE denial — judged
// after validation — records them: they name the resource attempted.
export type OpProvenanceOutcome =
  | "ok"
  | "proposed"
  | `denied:${string}`
  | `invalid:${string}`
  | `failed:${string}`;

export type OpProvenanceRecord = {
  // Kernel-stamped at record creation (every path funnels through the one
  // record() helper, off-contract included): records are events, and events
  // are self-identifying — `at` alone collides within a millisecond.
  id: string;
  at: string;
  identityKey: string;
  op: string;
  kind: Exclude<OpKind, "nav">;
  surface: OpSurface;
  // Absent on identity-denied and invalid records (nothing unvalidated is
  // ever recorded); present on resource denials (validated by then).
  args?: unknown;
  outcome: OpProvenanceOutcome;
  // The committed write's scope VALUE (the impl-returned one the change
  // event carries) — present exactly when a scoped write reached "ok", so
  // provenance and the poke agree on where a change landed.
  scope?: string;
  durationMs: number;
};

// Emitted after a write COMMITS (never before, never for reads). The
// payload is deliberately minimal — a poke, never data; subscribers
// refetch through the guarded read path. scope is present exactly when the
// op declares one; scopeless events are global (heard by every
// subscriber).
export type OpChangeEvent = { type: "op"; name: string; scope?: string };

// The dispatch result. 401/503-resolve never appear: an unresolved identity
// never reaches dispatch — the door owns that distinction. unavailable is a
// guard that THREW (cannot judge → 503, per _113's tri-state doctrine).
export type OpOutcome =
  | { kind: "ok"; data: unknown }
  | { kind: "pending"; preview: ProposalPreview; proposalKey: string }
  | { kind: "stream"; frames: AsyncIterable<QueryState<unknown>> }
  | { kind: "notfound"; err: string }
  | { kind: "invalid"; err: string }
  | { kind: "denied"; err: string }
  | { kind: "unavailable"; err: string }
  | { kind: "failed"; err: string };

// What an approval-gated op's call resolves to on the wire: the kernel wraps
// so the client can discriminate without guessing.
export type OpApprovalCallData<T> =
  | { status: "pending"; preview: ProposalPreview; proposalKey: string }
  | { status: "committed"; result: T };

// The registry serialized — the ops-catalog view, docs generation, and the
// MCP surface all read this, so none can drift from the declarations.
export type OpCatalogEntry = {
  name: string;
  kind: OpKind;
  title: string;
  description: string;
  auth: string;
  resource?: string;
  exposure: OpExposure;
  approval: boolean;
  streaming: boolean;
  redact: string[];
  scope?: string;
  inputSchema: unknown;
  // Serialized from the declared output. Absent exactly on nav entries
  // (nav ops declare no output).
  outputSchema?: unknown;
};

// Thrown by impls (or previews) whose failure message is safe to show on the
// wire — the parallel of _112's AIToolFailure. Any other throw reaches the
// client as generic text with the detail logged server-side.
export class OpFailure extends Error {}
