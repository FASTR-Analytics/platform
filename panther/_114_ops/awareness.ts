// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The awareness half of the notify seam (panterra vision goal 4, decision
// 27): an assistant turn begins knowing what changed since its last turn —
// without asking. The digest is DERIVED from the provenance log the kernel
// already writes (no second event system, no per-site notify calls); the
// record id is the cursor. Delivered as meaning, not logs: mechanical
// aggregation — deterministic, model-free, testable — collapses repetitive
// writes to counts while every non-ok outcome stays itemized.
//
// Browser-safe: pure functions plus a client tracker over the notify
// subscriber; nothing here touches a server API.

import type { OpEventsConnection } from "./notify_client.ts";
import type { OpProvenanceRecord } from "./types.ts";

// What a digest producer needs from the app's provenance store. Records
// return OLDEST-FIRST, strictly after the given record id; an id the store
// no longer holds (capped retention) returns everything it still has — the
// digest's own line cap bounds the flood.
export type OpAwarenessSource = {
  latestRecordId: () => Promise<string | null>;
  recordsSince: (recordId: string) => Promise<OpProvenanceRecord[]>;
};

export type OpDigestOptions = {
  // Drop records the reader should not be told about — its OWN actions
  // (match surface + identityKey). The digest informs, never guards.
  exclude?: (record: OpProvenanceRecord) => boolean;
  // Line cap: oldest lines collapse into a trailing "…and N earlier
  // changes" so the newest activity always survives.
  maxLines?: number;
};

const DEFAULT_MAX_LINES = 12;
const ARGS_CHARS = 100;

// Records → digest lines, or null when nothing is worth saying. WRITES
// only: awareness is about changes, and read records are machine plumbing
// (every live-query refetch logs one). Runs of the same actor × op × scope
// with outcome "ok" collapse to a count; anything denied/invalid/failed is
// always its own line with the reason.
export function digestOpRecords(
  records: OpProvenanceRecord[],
  opts?: OpDigestOptions,
): string | null {
  const maxLines = opts?.maxLines ?? DEFAULT_MAX_LINES;
  const relevant = records.filter((r) =>
    r.kind === "write" && !(opts?.exclude?.(r) ?? false)
  );
  if (relevant.length === 0) {
    return null;
  }
  const lines: string[] = [];
  let i = 0;
  while (i < relevant.length) {
    const r = relevant[i];
    if (r.outcome === "ok" || r.outcome === "proposed") {
      let n = 1;
      while (
        i + n < relevant.length &&
        sameRun(r, relevant[i + n])
      ) {
        n++;
      }
      lines.push(
        n === 1
          ? `${who(r)} ${r.op}${scopeOf(r)}${argsOf(r)}`
          : `${who(r)} ${r.op} ×${n}${scopeOf(r)}`,
      );
      i += n;
    } else {
      lines.push(`${who(r)} ${r.op}${scopeOf(r)} — ${r.outcome}`);
      i++;
    }
  }
  if (lines.length > maxLines) {
    const dropped = lines.length - (maxLines - 1);
    return [
      `…and ${dropped} earlier change(s)`,
      ...lines.slice(dropped),
    ].join("\n");
  }
  return lines.join("\n");
}

function sameRun(a: OpProvenanceRecord, b: OpProvenanceRecord): boolean {
  return b.outcome === a.outcome && b.op === a.op &&
    b.identityKey === a.identityKey && b.surface === a.surface &&
    b.scope === a.scope;
}

function who(r: OpProvenanceRecord): string {
  return `${r.identityKey} (${r.surface})`;
}

function scopeOf(r: OpProvenanceRecord): string {
  return r.scope === undefined ? "" : ` [${r.scope}]`;
}

function argsOf(r: OpProvenanceRecord): string {
  if (r.args === undefined) {
    return "";
  }
  let text: string;
  try {
    text = JSON.stringify(r.args);
  } catch {
    return "";
  }
  if (text === "{}" || text === undefined) {
    return "";
  }
  return ` ${
    text.length > ARGS_CHARS ? text.slice(0, ARGS_CHARS) + "…" : text
  }`;
}

// The client half: buffers change-driven fetches so a SYNCHRONOUS drain can
// hand the chat engine its per-send digest (the _305 getEphemeralContext
// seam is sync by design). Pokes on the events connection trigger fetches;
// the cursor advances as records arrive; drain() empties the buffer.
// Baseline on first connect: cursor = the newest existing record — a fresh
// surface starts aware of the future, not the past (the past is a read
// away; that is visibility).
export type OpAwarenessTracker = {
  // The pending digest, cursor-consumed: null when nothing happened.
  drain: () => string | null;
  close: () => void;
};

export function createOpAwarenessTracker(config: {
  source: OpAwarenessSource;
  connection: OpEventsConnection;
  exclude?: (record: OpProvenanceRecord) => boolean;
  maxLines?: number;
}): OpAwarenessTracker {
  let cursor: string | null = null;
  let buffer: OpProvenanceRecord[] = [];
  let fetching = false;
  let queued = false;
  let closed = false;

  async function pull(): Promise<void> {
    if (fetching) {
      queued = true;
      return;
    }
    fetching = true;
    try {
      if (cursor === null) {
        cursor = await config.source.latestRecordId();
        return;
      }
      const fresh = await config.source.recordsSince(cursor);
      if (closed || fresh.length === 0) {
        return;
      }
      buffer = [...buffer, ...fresh];
      cursor = fresh[fresh.length - 1].id;
    } catch {
      // A failed pull loses nothing: the cursor did not advance, and the
      // next poke (or reconnect) retries from the same position.
    } finally {
      fetching = false;
      if (queued && !closed) {
        queued = false;
        void pull();
      }
    }
  }

  const unlisten = config.connection.listen({
    onConnect: () => void pull(),
    onEvent: () => void pull(),
  });

  return {
    drain: () => {
      if (buffer.length === 0) {
        return null;
      }
      const digest = digestOpRecords(buffer, {
        exclude: config.exclude,
        maxLines: config.maxLines,
      });
      buffer = [];
      return digest;
    },
    close: () => {
      closed = true;
      unlisten();
    },
  };
}
