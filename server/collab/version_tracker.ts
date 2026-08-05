// =============================================================================
// Version tracker — turns a stream of edit events into editing-session versions
// =============================================================================
//
// Google-Docs-style version history: rather than a version per keystroke, edits
// accumulate per document until the session "ends", then ONE version is written
// with the union of everyone who edited in that window. A session ends when:
//   - the document has been idle for `idleGapMs`, or
//   - the session has run for `maxSessionMs` (long sessions split; the ongoing
//     editing simply starts a fresh accumulator on the next edit), or
//   - the collab room emptied `emptyGraceMs` ago and nothing was edited since
//     (the grace absorbs page refreshes / reconnects).
//
// This module is PURE: the clock and all storage access are injected
// (VersionTrackerDeps), so a harness can drive it with a fake clock. The live
// binding (real DB deps, singleton, sweep interval) is version_capture.ts.
//
// Flush hardening: the accumulator is detached from the registry BEFORE the
// async work, so a concurrent recordEdit starts a fresh session instead of
// mutating one mid-flush; on a failed write the detached accumulator is merged
// back and retried on the next sweep. A flush whose content hash equals the
// newest stored version is dropped (the session produced no net change).

import type { VersionEditor } from "lib";

export type VersionKind = "report" | "deck";

/** Opaque snapshot: the tracker only compares `contentHash`; `data` is passed
 *  through to writeVersion untouched. */
export type VersionPayload = {
  contentHash: string;
  data: unknown;
};

export type VersionTrackerDeps = {
  now: () => number;
  /** Load the document's current content. null MUST mean the document row is
   *  gone (session dropped); any transient failure must THROW instead so the
   *  session merges back and retries on the next sweep. */
  loadPayload: (
    projectId: string,
    kind: VersionKind,
    docId: string,
  ) => Promise<VersionPayload | null>;
  /** content_hash of the newest stored version, or null when none exist. */
  latestHash: (
    projectId: string,
    kind: VersionKind,
    docId: string,
  ) => Promise<string | null>;
  /** Insert the version (and prune). Returns false on failure (retry later). */
  writeVersion: (
    projectId: string,
    kind: VersionKind,
    docId: string,
    payload: VersionPayload,
    editors: VersionEditor[],
    createdAt: string,
  ) => Promise<boolean>;
  /** Called exactly once per finalized editing session — including sessions
   *  dropped by the content-hash dedup (edit-then-revert is still usage),
   *  sessions whose document was deleted, and sessions absorbed by a restore
   *  (drainEditors). NOT called when a failed write merges the session back:
   *  the retried flush reports the merged session instead. Must not throw. */
  onSessionEnd?: (session: {
    projectId: string;
    kind: VersionKind;
    docId: string;
    editors: VersionEditor[];
    /** Epoch ms of the session's first edit. */
    startedAt: number;
  }) => void;
};

export type VersionTrackerOpts = {
  idleGapMs?: number;
  maxSessionMs?: number;
  emptyGraceMs?: number;
};

const DEFAULT_IDLE_GAP_MS = 10 * 60_000;
const DEFAULT_MAX_SESSION_MS = 45 * 60_000;
const DEFAULT_EMPTY_GRACE_MS = 2 * 60_000;

type Accumulator = {
  projectId: string;
  kind: VersionKind;
  docId: string;
  editors: Map<string, string>; // email -> name
  dirtySince: number;
  lastEditAt: number;
  roomEmptyAt: number | null;
};

export type VersionTracker = {
  recordEdit: (
    projectId: string,
    kind: VersionKind,
    docId: string,
    editor: VersionEditor,
  ) => void;
  /** The collab room for this document just emptied — start the grace timer. */
  noteRoomEmpty: (projectId: string, kind: VersionKind, docId: string) => void;
  /** Remove the document's open session and return its editors. Used by the
   *  restore routes: the safety version they write absorbs the open session's
   *  attribution (otherwise those editors would never appear in any version —
   *  the post-restore flush would hash-dedup against the restored state). */
  drainEditors: (
    projectId: string,
    kind: VersionKind,
    docId: string,
  ) => VersionEditor[];
  /** Flush every session whose end condition is met. Run on an interval. */
  sweep: () => Promise<void>;
  /** Flush every open session unconditionally (graceful shutdown). */
  flushAll: () => Promise<void>;
  /** User email rename: re-key the editor in every open session so later
   *  flushes attribute the window to the new address. */
  renameEditorEmail: (oldEmail: string, newEmail: string) => void;
};

export function createVersionTracker(
  deps: VersionTrackerDeps,
  opts?: VersionTrackerOpts,
): VersionTracker {
  const idleGapMs = opts?.idleGapMs ?? DEFAULT_IDLE_GAP_MS;
  const maxSessionMs = opts?.maxSessionMs ?? DEFAULT_MAX_SESSION_MS;
  const emptyGraceMs = opts?.emptyGraceMs ?? DEFAULT_EMPTY_GRACE_MS;

  const accumulators = new Map<string, Accumulator>();

  function accKey(projectId: string, kind: VersionKind, docId: string): string {
    return `${projectId}::${kind}::${docId}`;
  }

  function recordEdit(
    projectId: string,
    kind: VersionKind,
    docId: string,
    editor: VersionEditor,
  ): void {
    const key = accKey(projectId, kind, docId);
    const now = deps.now();
    const acc = accumulators.get(key);
    if (acc) {
      acc.editors.set(editor.email, editor.name);
      acc.lastEditAt = now;
      // An edit means someone is active again — cancel the empty-room grace.
      acc.roomEmptyAt = null;
    } else {
      accumulators.set(key, {
        projectId,
        kind,
        docId,
        editors: new Map([[editor.email, editor.name]]),
        dirtySince: now,
        lastEditAt: now,
        roomEmptyAt: null,
      });
    }
  }

  function noteRoomEmpty(
    projectId: string,
    kind: VersionKind,
    docId: string,
  ): void {
    const acc = accumulators.get(accKey(projectId, kind, docId));
    if (acc) {
      acc.roomEmptyAt = deps.now();
    }
  }

  function accEditors(acc: Accumulator): VersionEditor[] {
    return [...acc.editors.entries()].map(([email, name]) => ({ email, name }));
  }

  function noteSessionEnd(acc: Accumulator): void {
    deps.onSessionEnd?.({
      projectId: acc.projectId,
      kind: acc.kind,
      docId: acc.docId,
      editors: accEditors(acc),
      startedAt: acc.dirtySince,
    });
  }

  function drainEditors(
    projectId: string,
    kind: VersionKind,
    docId: string,
  ): VersionEditor[] {
    const key = accKey(projectId, kind, docId);
    const acc = accumulators.get(key);
    if (!acc) {
      return [];
    }
    accumulators.delete(key);
    noteSessionEnd(acc);
    return accEditors(acc);
  }

  function shouldFlush(acc: Accumulator, now: number): boolean {
    if (now - acc.lastEditAt >= idleGapMs) {
      return true;
    }
    if (now - acc.dirtySince >= maxSessionMs) {
      return true;
    }
    if (
      acc.roomEmptyAt !== null &&
      now - Math.max(acc.roomEmptyAt, acc.lastEditAt) >= emptyGraceMs
    ) {
      return true;
    }
    return false;
  }

  function mergeBack(acc: Accumulator): void {
    const key = accKey(acc.projectId, acc.kind, acc.docId);
    const fresh = accumulators.get(key);
    if (!fresh) {
      accumulators.set(key, acc);
      return;
    }
    // A new session started while we were flushing — fold the failed flush's
    // window into it so no contributor is lost.
    for (const [email, name] of acc.editors) {
      if (!fresh.editors.has(email)) {
        fresh.editors.set(email, name);
      }
    }
    fresh.dirtySince = Math.min(fresh.dirtySince, acc.dirtySince);
    fresh.lastEditAt = Math.max(fresh.lastEditAt, acc.lastEditAt);
  }

  async function flush(acc: Accumulator): Promise<void> {
    const { projectId, kind, docId } = acc;
    try {
      const payload = await deps.loadPayload(projectId, kind, docId);
      if (payload === null) {
        noteSessionEnd(acc);
        return; // document deleted — drop the session
      }
      const latest = await deps.latestHash(projectId, kind, docId);
      if (latest !== null && latest === payload.contentHash) {
        noteSessionEnd(acc);
        return; // no net change
      }
      const editors = accEditors(acc);
      const createdAt = new Date(deps.now()).toISOString();
      const ok = await deps.writeVersion(
        projectId,
        kind,
        docId,
        payload,
        editors,
        createdAt,
      );
      if (!ok) {
        mergeBack(acc);
        return;
      }
      noteSessionEnd(acc);
    } catch (error) {
      console.error(
        `Version flush failed (${kind} ${docId}):`,
        error instanceof Error ? error.message : error,
      );
      mergeBack(acc);
    }
  }

  async function sweep(): Promise<void> {
    const now = deps.now();
    // Detach every due accumulator synchronously FIRST — a concurrent sweep or
    // recordEdit during the awaits below must not see (or double-flush) them.
    const due: Accumulator[] = [];
    for (const [key, acc] of accumulators) {
      if (shouldFlush(acc, now)) {
        accumulators.delete(key);
        due.push(acc);
      }
    }
    for (const acc of due) {
      await flush(acc);
    }
  }

  async function flushAll(): Promise<void> {
    const all = [...accumulators.values()];
    accumulators.clear();
    for (const acc of all) {
      await flush(acc);
    }
  }

  function renameEditorEmail(oldEmail: string, newEmail: string): void {
    for (const acc of accumulators.values()) {
      const name = acc.editors.get(oldEmail);
      if (name === undefined) {
        continue;
      }
      acc.editors.delete(oldEmail);
      if (!acc.editors.has(newEmail)) {
        acc.editors.set(newEmail, name);
      }
    }
  }

  return {
    recordEdit,
    noteRoomEmpty,
    drainEditors,
    sweep,
    flushAll,
    renameEditorEmail,
  };
}
