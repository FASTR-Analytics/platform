// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The ops MCP door (graduated from the panterra lab): ONE call serves every
// headless-exposed op as an MCP tool over _220's streamable-HTTP handler.
// The tool list is derived from the same declarations the server boots
// (opsToMCPTools filters on exposure.headless; there is no second
// allowlist), and every call enters the kernel's single authorize →
// validate → execute → log → emit dispatch with surface "mcp". Ops excluded
// from headless are refused at the wire by construction: they are never
// projected, and the _112 core answers unknown tool names with a protocol
// error. The RPC (_114 http), events (_114 notify), and MCP doors are
// symmetric: one call each.
//
// Auth is the identity seam itself: the provider's tri-state resolve maps
// 1:1 onto _220's authenticate hook (identity / null → 401 / throw → 503).
// It runs on EVERY request — each tools/call is one HTTP request — so this
// door has exactly one judgment point and revocation is bounded by the
// provider. Per-op guards then run inside the kernel per dispatch: a deny
// is an isError tool result carrying the readable reason, 403 semantics
// without a second policy system.
//
// Approval runs in "elicit" mode: the computed preview goes to the human
// via elicitation and only an accepted decision commits (the _112 staged
// proposal composes with the kernel's principal-bound key). A client that
// cannot elicit fails closed on writes. The approval-exempt list is DERIVED
// from the registry (the boot-checked approvalExempt declarations), so the
// kernel's approval doctrine and _112's construction-time re-check can
// never disagree.
//
// kernel and ops must be the SAME pair the app booted: the tools project
// from `ops` while dispatch enters `kernel`. A mismatched pair is not
// detectable here — an op projected but unknown to the kernel degrades to a
// notfound tool result — so the invariant is the caller's.

import {
  createMCPHttpHandler,
  digestOpRecords,
  opsApprovalExempt,
  opsToMCPTools,
} from "./deps.ts";
import type {
  APIResponseWithData,
  CreateMCPHttpHandlerOptions,
  IdentityProvider,
  OpAwarenessSource,
  OpKernel,
  OpOutcome,
  OpRegistry,
} from "./deps.ts";

export type OpMCPHandlerConfig<TIdentity> = {
  kernel: Pick<OpKernel<TIdentity>, "dispatch">;
  ops: OpRegistry;
  provider: IdentityProvider<TIdentity>;
  name: string;
  version: string;
  instructions?: string;
  // The _115 createOAuthDiscoveryHandler result, consumed WHOLE: the 401
  // challenge's resource_metadata pointer derives from the same origin
  // derivation as the document it points at, by construction — never a
  // hand-plumbed URL. Structural on purpose: the door is provider-agnostic
  // (a PAT-authenticated deployment passes no discovery at all).
  discovery?: { resourceMetadataUrl: (req: Request) => string };
  // Awareness (panterra vision goal 4): when set, every complete tools/call
  // result carries a digest of what OTHER actors and surfaces changed since
  // this conversation's last call — derived from the provenance log, keyed
  // by MCP session (principal as fallback), own actions excluded. A fresh
  // conversation baselines silently: aware of the future, not the past.
  awareness?: OpAwarenessSource;
  // _220's operational knobs (allowedOrigins, session caps, TTLs, …),
  // passed through so a consumer needing them never bypasses the wrapper —
  // there must never be two ways to build the door. The identity-seam slots
  // are excluded: they are this door's own wiring, and decorateResult is
  // the awareness seam's.
  http?: Omit<
    CreateMCPHttpHandlerOptions<TIdentity>,
    "authenticate" | "principalKey" | "resourceMetadataUrl" | "decorateResult"
  >;
};

// OpOutcome → the projection envelope. The stream arm is unreachable by
// construction: the kernel's boot validation forbids streaming + headless,
// so no projected tool can dispatch a streaming op.
function toEnvelope(outcome: OpOutcome): APIResponseWithData<unknown> {
  switch (outcome.kind) {
    case "ok":
      return { success: true, data: outcome.data };
    case "pending":
      return {
        success: true,
        data: {
          status: "pending",
          preview: outcome.preview,
          proposalKey: outcome.proposalKey,
        },
      };
    case "stream":
      throw new Error("A streaming op cannot be dispatched from MCP");
    default:
      return { success: false, err: outcome.err };
  }
}

// Awareness cursors: one per MCP conversation (session id when the wire
// carries one, principal key otherwise), bounded FIFO. The value is the id
// of the newest record this conversation has been told about (or has
// baselined past).
const MAX_AWARENESS_CURSORS = 1000;

function buildAwarenessDecorator<TIdentity>(
  source: OpAwarenessSource,
  identityKey: (identity: TIdentity) => string,
): (ctx: {
  principal: TIdentity;
  sessionId?: string;
}) => Promise<string | null> {
  const cursors = new Map<string, string>();
  return async (ctx) => {
    const principalKey = identityKey(ctx.principal);
    const key = ctx.sessionId ?? principalKey;
    const cursor = cursors.get(key);
    if (cursor === undefined) {
      const latest = await source.latestRecordId();
      if (latest !== null) {
        if (cursors.size >= MAX_AWARENESS_CURSORS) {
          const oldest = cursors.keys().next().value;
          if (oldest !== undefined) {
            cursors.delete(oldest);
          }
        }
        cursors.set(key, latest);
      }
      return null;
    }
    const records = await source.recordsSince(cursor);
    if (records.length === 0) {
      return null;
    }
    cursors.set(key, records[records.length - 1].id);
    const digest = digestOpRecords(records, {
      exclude: (r) => r.surface === "mcp" && r.identityKey === principalKey,
    });
    return digest === null
      ? null
      : `[What changed since your last call — other users and surfaces]\n${digest}`;
  };
}

export function createOpMCPHandler<TIdentity>(
  config: OpMCPHandlerConfig<TIdentity>,
): (req: Request) => Promise<Response> {
  return createMCPHttpHandler<TIdentity>({
    name: config.name,
    version: config.version,
    ...(config.instructions !== undefined
      ? { instructions: config.instructions }
      : {}),
    tools: (ctx) =>
      opsToMCPTools(config.ops, {
        run: async (name, args, opts) =>
          toEnvelope(
            await config.kernel.dispatch(name, args, ctx.principal, "mcp", {
              proposalKey: opts?.proposalKey,
            }),
          ),
      }),
    approvalMode: "elicit",
    approvalPolicy: {
      requireForKind: "write",
      requireKind: true,
      exempt: opsApprovalExempt(config.ops),
    },
  }, {
    ...config.http,
    authenticate: (req) => config.provider.resolve(req),
    principalKey: (identity) => config.provider.identityKey(identity),
    ...(config.awareness !== undefined
      ? {
        decorateResult: buildAwarenessDecorator(
          config.awareness,
          (identity: TIdentity) => config.provider.identityKey(identity),
        ),
      }
      : {}),
    ...(config.discovery !== undefined
      ? {
        resourceMetadataUrl: (req: Request) =>
          config.discovery?.resourceMetadataUrl(req),
      }
      : {}),
  });
}
