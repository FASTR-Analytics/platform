// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The ops kernel: boot-time registry validation (every check that would
// otherwise be a silent per-site omission) and the single dispatch sequence
// authorize → validate → execute → log → emit that EVERY surface enters
// (panterra R2/R3). The kernel is transport-free by construction: no
// Request, no path, no framework type appears in any signature here.

import { stableStringify, z } from "./deps.ts";
import type { Guard, ProposalPreview, QueryState } from "./deps.ts";
import { OpFailure } from "./types.ts";
import type {
  OpCatalogEntry,
  OpChangeEvent,
  OpContract,
  OpCtx,
  OpImpls,
  OpKind,
  OpOutcome,
  OpProvenanceOutcome,
  OpProvenanceRecord,
  OpRegistry,
  OpScoped,
  OpSurface,
} from "./types.ts";

// Op names are wire path segments, tool names, and log keys; MCP tool names
// allow [a-zA-Z0-9_-]{1,64}.
const OP_NAME_REGEX = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

const DEFAULT_PROPOSAL_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ARG_CHARS = 2_000;

export type OpKernelConfig<
  TAuth extends string,
  TReg extends OpRegistry<TAuth>,
  TIdentity,
> = {
  ops: TReg;
  impls: OpImpls<TReg, TIdentity>;
  // The app's policy vocabulary mapped to _113 guards — the ONLY place
  // policy data becomes decisions. Boot fails on an uncovered value.
  guards: Record<TAuth, Guard<TIdentity>>;
  // Provenance subject (_113's parity join): same person, any credential
  // type, same key.
  identityKey: (identity: TIdentity) => string;
  provenance: {
    // A throwing sink is caught and logged — it never breaks the response.
    sink: (record: OpProvenanceRecord) => void;
    maxArgChars?: number;
  };
  // Conformance check: validate every result (and every streaming ready
  // frame) against the op's declared output schema after execute.
  // CHECK-ONLY — the parse result is discarded, never substituted, so the
  // flag can never change what the wire carries. Kernel-wide on purpose:
  // per-op opt-out is the per-site-omission anti-pattern this module exists
  // to close. Default false; a dev deployment turns it on.
  validateOutputs?: boolean;
  // Called after a write COMMITS. Reads never emit.
  emit?: (event: OpChangeEvent) => void;
  proposalTtlMs?: number;
  // Injectable clock for tests.
  now?: () => number;
};

export type OpDispatchOpts = { proposalKey?: string };

// A declared off-contract mutation's provenance (e.g. a multipart upload
// route that cannot fit the JSON envelope): the caller shapes the record,
// the kernel keeps the funnel discipline. identity is the resolved identity
// — the kernel applies its own identityKey, so an off-contract record joins
// the same parity key as dispatched ops. There is no op contract here, so
// no redact list applies: truncation only. Emission stays the caller's line
// (ordering after commit is theirs by nature).
export type OpOffContractRecord<TIdentity> = {
  op: string;
  kind: Exclude<OpKind, "nav">;
  surface: OpSurface;
  identity: TIdentity;
  args?: unknown;
  outcome: OpProvenanceOutcome;
  startedAt: number;
};

export type OpKernel<TIdentity> = {
  dispatch: (
    name: string,
    rawArgs: unknown,
    identity: TIdentity,
    surface: OpSurface,
    opts?: OpDispatchOpts,
  ) => Promise<OpOutcome>;
  catalog: () => OpCatalogEntry[];
  // Writes an off-contract record through the SAME funnel as dispatch: arg
  // truncation, sink-guard (a failing sink never throws).
  logOffContract: (record: OpOffContractRecord<TIdentity>) => void;
};

export function createOpKernel<
  TAuth extends string,
  TReg extends OpRegistry<TAuth>,
  TIdentity,
>(config: OpKernelConfig<TAuth, TReg, TIdentity>): OpKernel<TIdentity> {
  const ops = config.ops as Record<string, OpContract>;
  const impls = config.impls as Record<string, {
    preview?: (args: unknown, ctx: OpCtx<TIdentity>) => unknown;
    execute: (args: unknown, ctx: OpCtx<TIdentity>) => unknown;
  }>;
  const guards = config.guards as Record<string, Guard<TIdentity>>;
  const now = config.now ?? Date.now;
  const proposalTtlMs = config.proposalTtlMs ?? DEFAULT_PROPOSAL_TTL_MS;
  const maxArgChars = config.provenance.maxArgChars ?? DEFAULT_MAX_ARG_CHARS;

  validateRegistry(ops, impls, guards);

  // Approval staging: proposalKey → the exact op + args it previewed AND the
  // identity that previewed them, so a confirm can never commit anything but
  // what was shown, by anyone but the person it was shown to (the argsKey
  // discipline _112's MCP core uses, plus principal binding — the guarantee
  // must hold at this layer, not depend on an adapter's core isolation: the
  // UI door hands keys to clients). In-memory and TTL-bound: an expired or
  // mismatched key means "re-propose", never a silent commit.
  const proposals = new Map<
    string,
    { name: string; argsKey: string; identityKey: string; expiresAt: number }
  >();

  function pruneProposals(): void {
    const t = now();
    for (const [key, staged] of proposals) {
      if (staged.expiresAt <= t) {
        proposals.delete(key);
      }
    }
  }

  function record(
    op: string,
    kind: Exclude<OpKind, "nav">,
    identity: TIdentity,
    surface: OpSurface,
    args: unknown,
    outcome: OpProvenanceOutcome,
    startedAt: number,
  ): void {
    try {
      config.provenance.sink({
        at: new Date(now()).toISOString(),
        identityKey: config.identityKey(identity),
        op,
        kind,
        surface,
        args,
        outcome,
        durationMs: now() - startedAt,
      });
    } catch (cause) {
      // R7: a failed log write must never break the response.
      console.error(`Provenance sink failed for op "${op}":`, cause);
    }
  }

  async function dispatch(
    name: string,
    rawArgs: unknown,
    identity: TIdentity,
    surface: OpSurface,
    opts?: OpDispatchOpts,
  ): Promise<OpOutcome> {
    const startedAt = now();
    const op = ops[name];
    const impl = impls[name];
    if (op === undefined || op.kind === "nav" || impl === undefined) {
      // Unknown names are not provenance: there is no op to attribute them
      // to, and a scanner probing paths would otherwise flood the log.
      return { kind: "notfound", err: `Unknown operation "${name}"` };
    }
    const kind = op.kind;
    const rec = (args: unknown, outcome: OpProvenanceOutcome) =>
      record(name, kind, identity, surface, args, outcome, startedAt);

    // 1. Authorize (the guard judges an already-resolved identity; a throw
    //    is "cannot judge" → 503, per _113).
    let decision;
    try {
      decision = await guards[op.auth](identity);
    } catch (cause) {
      console.error(`Guard for op "${name}" threw:`, cause);
      rec(undefined, "failed:guard unavailable");
      return { kind: "unavailable", err: "Authorization service unavailable" };
    }
    if (!decision.allow) {
      // Denials ARE provenance (R7.4) — but carry no args: nothing
      // unvalidated is ever recorded.
      rec(undefined, `denied:${decision.reason}`);
      return { kind: "denied", err: decision.reason };
    }

    // 2. Validate.
    const parsed = op.input.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      rec(undefined, `invalid:${parsed.error.message}`);
      return { kind: "invalid", err: `Invalid input: ${parsed.error.message}` };
    }
    const args = parsed.data;
    const recArgs = redactAndTruncate(args, op.redact, maxArgChars);

    // 3. Approval lifecycle (writes declared approval: true).
    if (op.approval === true) {
      if (opts?.proposalKey === undefined) {
        let preview: ProposalPreview;
        try {
          preview = await (impl.preview as (
            a: unknown,
            c: OpCtx<TIdentity>,
          ) => ProposalPreview | Promise<ProposalPreview>)(args, {
            identity,
            surface,
          });
        } catch (cause) {
          return failedOutcome(name, cause, rec, recArgs);
        }
        pruneProposals();
        const proposalKey = crypto.randomUUID();
        proposals.set(proposalKey, {
          name,
          argsKey: stableStringify(args),
          identityKey: config.identityKey(identity),
          expiresAt: now() + proposalTtlMs,
        });
        rec(recArgs, "proposed");
        return { kind: "pending", preview, proposalKey };
      }
      pruneProposals();
      const staged = proposals.get(opts.proposalKey);
      if (
        staged === undefined || staged.name !== name ||
        staged.argsKey !== stableStringify(args) ||
        // Another identity's key is answered exactly like an expired one:
        // existence is never leaked.
        staged.identityKey !== config.identityKey(identity)
      ) {
        rec(recArgs, "invalid:proposal expired or does not match");
        return {
          kind: "invalid",
          err: "Proposal expired or does not match; request a new preview",
        };
      }
      proposals.delete(opts.proposalKey);
    }

    // 4. Execute → 5. log → 6. emit (emission strictly AFTER commit).
    try {
      if (op.streaming === true) {
        let frames = impl.execute(args, {
          identity,
          surface,
        }) as AsyncIterable<
          QueryState<unknown>
        >;
        if (config.validateOutputs === true && op.output !== undefined) {
          frames = validateFrames(name, op.output, frames);
        }
        // The record marks the stream as OPENED; a mid-stream error is an
        // error frame to the consumer, not a second provenance record.
        rec(recArgs, "ok");
        return { kind: "stream", frames };
      }
      let data = await impl.execute(args, { identity, surface });
      let scope: string | undefined;
      if (op.scope !== undefined) {
        // The declaration promises a scoped event; an impl that broke the
        // { scope, result } contract (erased caller) is an impl bug — the
        // throw lands in the failed funnel, never a silently global event.
        if (
          typeof data !== "object" || data === null || !("scope" in data) ||
          typeof (data as OpScoped<unknown>).scope !== "string" ||
          !("result" in data)
        ) {
          throw new Error(
            `op "${name}" declares scope "${op.scope}" but its impl did not return { scope, result }`,
          );
        }
        scope = (data as OpScoped<unknown>).scope;
        data = (data as OpScoped<unknown>).result;
      }
      if (config.validateOutputs === true && op.output !== undefined) {
        // CHECK-ONLY: the parse result is discarded, so the flag never
        // changes wire data — it only judges. A nonconforming return is an
        // impl bug and lands in the same funnel as the broken scope
        // contract: failed outcome, provenance row, never an emit (the
        // mutation may have run, exactly like an impl that throws after
        // mutating).
        const conforming = op.output.safeParse(data);
        if (!conforming.success) {
          console.error(
            `Op "${name}" output does not match its declared schema:`,
            conforming.error.message,
          );
          rec(recArgs, `failed:output validation: ${conforming.error.message}`);
          return {
            kind: "failed",
            err: "Output did not match the declared schema",
          };
        }
      }
      rec(recArgs, "ok");
      if (op.kind === "write") {
        config.emit?.(
          scope === undefined
            ? { type: "op", name }
            : { type: "op", name, scope },
        );
      }
      return {
        kind: "ok",
        data: op.approval === true
          ? { status: "committed", result: data }
          : data,
      };
    } catch (cause) {
      return failedOutcome(name, cause, rec, recArgs);
    }
  }

  function logOffContract(record_: OpOffContractRecord<TIdentity>): void {
    record(
      record_.op,
      record_.kind,
      record_.identity,
      record_.surface,
      redactAndTruncate(record_.args, undefined, maxArgChars),
      record_.outcome,
      record_.startedAt,
    );
  }

  function catalog(): OpCatalogEntry[] {
    return Object.entries(ops).map(([name, op]) => ({
      name,
      kind: op.kind,
      title: op.title,
      description: op.description,
      auth: op.auth,
      exposure: op.exposure,
      approval: op.approval === true,
      streaming: op.streaming === true,
      redact: [...(op.redact ?? [])],
      ...(op.scope !== undefined ? { scope: op.scope } : {}),
      inputSchema: z.toJSONSchema(op.input, { io: "input" }),
      ...(op.output !== undefined
        ? { outputSchema: z.toJSONSchema(op.output, { io: "output" }) }
        : {}),
    }));
  }

  return { dispatch, catalog, logOffContract };
}

// The streaming half of validateOutputs: every ready frame claims the
// declared output type, so each is checked as it passes. This runs
// MID-STREAM — the outcome was returned and the record written at open — so
// a nonconforming frame can only ever be an error frame to the consumer,
// never a failed outcome or a second provenance record (dispatch's
// stream-open doctrine). The stream ends on the replacement frame.
async function* validateFrames(
  name: string,
  schema: z.ZodType,
  frames: AsyncIterable<QueryState<unknown>>,
): AsyncGenerator<QueryState<unknown>> {
  for await (const frame of frames) {
    if (frame.status === "ready") {
      const conforming = schema.safeParse(frame.data);
      if (!conforming.success) {
        console.error(
          `Op "${name}" ready frame does not match its declared output schema:`,
          conforming.error.message,
        );
        yield {
          status: "error",
          err: "Output did not match the declared schema",
        };
        return;
      }
    }
    yield frame;
  }
}

function failedOutcome(
  name: string,
  cause: unknown,
  rec: (args: unknown, outcome: OpProvenanceOutcome) => void,
  recArgs: unknown,
): OpOutcome {
  // OpFailure messages are wire-safe by contract; everything else gets
  // generic wire text with the detail logged server-side only (R8).
  const safe = cause instanceof OpFailure ? cause.message : undefined;
  console.error(`Op "${name}" failed:`, cause);
  rec(recArgs, `failed:${safe ?? String(cause)}`);
  return { kind: "failed", err: safe ?? "Unexpected error" };
}

////////////////////////////////////////////////////////////////////////////////
// BOOT VALIDATION (R2: fail server start, never fail at call time)
////////////////////////////////////////////////////////////////////////////////

function validateRegistry<TIdentity>(
  ops: Record<string, OpContract>,
  impls: Record<string, { preview?: unknown; execute: unknown }>,
  guards: Record<string, Guard<TIdentity>>,
): void {
  const fail = (msg: string): never => {
    throw new Error(`createOpKernel: ${msg}`);
  };
  for (const [name, op] of Object.entries(ops)) {
    if (!OP_NAME_REGEX.test(name)) {
      fail(
        `op name "${name}" must match ${OP_NAME_REGEX} (it becomes a path segment, tool name, and log key)`,
      );
    }
    if (guards[op.auth] === undefined) {
      fail(`op "${name}" declares auth "${op.auth}" but no such guard exists`);
    }
    if (
      typeof op.exposure.headless === "object" &&
      op.exposure.headless.excluded.trim() === ""
    ) {
      fail(`op "${name}": headless exclusion must state a reason (R9)`);
    }
    if (op.kind === "nav") {
      if (impls[name] !== undefined) {
        fail(`nav op "${name}" must not have a server impl`);
      }
      if (op.output !== undefined) {
        fail(
          `nav op "${name}" must not declare an output schema (navigation has no server result)`,
        );
      }
      if (op.approval === true || op.streaming === true) {
        fail(`nav op "${name}" cannot declare approval or streaming`);
      }
      if (op.exposure.headless === true) {
        fail(
          `nav op "${name}" cannot be headless (navigation needs a surface); declare the exclusion reason`,
        );
      }
      continue;
    }
    if (impls[name] === undefined) {
      fail(`op "${name}" has no impl`);
    }
    if (op.output === undefined) {
      fail(`op "${name}" declares no output schema`);
    }
    if (op.approval === true) {
      if (op.kind !== "write") {
        fail(`op "${name}": approval is for writes only`);
      }
      if (op.streaming === true) {
        fail(`op "${name}": streaming ops cannot be approval-gated`);
      }
      if (typeof impls[name].preview !== "function") {
        fail(`approval op "${name}" impl must provide preview`);
      }
      if (op.approvalExempt !== undefined) {
        fail(
          `op "${name}": approval and approvalExempt are mutually exclusive`,
        );
      }
    }
    if (op.approvalExempt !== undefined && op.kind !== "write") {
      fail(`op "${name}": approvalExempt is meaningless on a ${op.kind} op`);
    }
    if (
      op.kind === "write" && op.approval !== true &&
      (op.exposure.ai || op.exposure.headless === true) &&
      (op.approvalExempt === undefined || op.approvalExempt.trim() === "")
    ) {
      // The _112 requireForKind + requireKind doctrine applied at the
      // declaration layer: a write a machine can reach either previews or
      // states why it need not.
      fail(
        `write op "${name}" is exposed to AI/headless surfaces without approval — declare approval: true or approvalExempt with a reason`,
      );
    }
    if (op.scope !== undefined) {
      if (op.kind !== "write") {
        fail(
          `op "${name}": scope is for writes only (reads never emit change events)`,
        );
      }
      if (op.scope.trim() === "") {
        fail(`op "${name}": scope must name the scope kind (e.g. "project")`);
      }
    }
    if (op.streaming === true && op.kind !== "read") {
      fail(`op "${name}": streaming ops must be reads (Phase 2 scope)`);
    }
    if (op.streaming === true && op.exposure.headless === true) {
      // An MCP tool returns one result; a stream of frames cannot honor
      // that contract, so the projection must never see one.
      fail(
        `streaming op "${name}" cannot be headless (an MCP tool returns one result); declare the exclusion reason`,
      );
    }
    if (op.redact !== undefined && op.redact.length > 0) {
      const shape = op.input instanceof z.ZodObject
        ? op.input.shape
        : undefined;
      if (shape === undefined) {
        fail(`op "${name}": redact requires a z.object input schema`);
      }
      for (const field of op.redact) {
        if (shape !== undefined && !(field in shape)) {
          fail(
            `op "${name}": redact field "${field}" is not in the input schema`,
          );
        }
      }
    }
  }
  for (const name of Object.keys(impls)) {
    if (ops[name] === undefined) {
      fail(`impl "${name}" has no op declaration`);
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// HELPERS
////////////////////////////////////////////////////////////////////////////////

function redactAndTruncate(
  args: unknown,
  redact: readonly string[] | undefined,
  maxChars: number,
): unknown {
  let out = args;
  if (
    redact !== undefined && redact.length > 0 && typeof args === "object" &&
    args !== null && !Array.isArray(args)
  ) {
    const copy: Record<string, unknown> = {
      ...(args as Record<string, unknown>),
    };
    for (const field of redact) {
      if (field in copy && copy[field] !== undefined) {
        copy[field] = "[redacted]";
      }
    }
    out = copy;
  }
  const text = JSON.stringify(out);
  if (text !== undefined && text.length > maxChars) {
    // Oversize args are truncated with an explicit marker (R7).
    return {
      truncated: true,
      chars: text.length,
      head: text.slice(0, maxChars),
    };
  }
  return out;
}
