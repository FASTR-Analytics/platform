// =============================================================================
// Shared CRDT utilities (Yjs) — used by both document bridges
// =============================================================================
//
// Content-agnostic helpers shared by the CRDT bridges (slide_crdt.ts /
// report_crdt.ts / figure_config_crdt.ts); the base64 helpers also serve the
// WS transport on both ends. Nothing in here knows about slides or reports.
// Runs on both the Deno server and the Vite client.

import * as Y from "yjs";
import type { AuthorRun } from "../types/versions.ts";

// ── Authorship-run helpers ───────────────────────────────────────────────────
// Shared by the server ledger (server/collab/authorship.ts), the version
// writer, and the restore routes. Tombstones are runs with `deletedBy` set.

/** Live characters only — tombstones are transparent to body positions. */
export function liveAuthorRunLen(runs: AuthorRun[]): number {
  return runs.reduce((n, r) => (r.deletedBy !== undefined ? n : n + r.len), 0);
}

/** Drop tombstone runs, merging adjacent same-author live runs. Used when a
 *  ledger crosses a version boundary: a version snapshot captured the
 *  tombstones, so every copy that lives on (persisted row, restored-state
 *  version) must start the next window without them. */
export function stripTombstoneRuns(runs: AuthorRun[]): AuthorRun[] {
  const out: AuthorRun[] = [];
  for (const r of runs) {
    if (r.deletedBy !== undefined) {
      continue;
    }
    if (r.len <= 0) {
      continue;
    }
    const prev = out[out.length - 1];
    if (prev && prev.email === r.email) {
      prev.len += r.len;
    } else {
      out.push({ len: r.len, email: r.email });
    }
  }
  return out;
}

// ── Binary <-> base64 (for shipping Yjs updates over the JSON WS protocol) ───
// btoa/atob exist in both Deno and the browser. Chunked to avoid a call-stack
// overflow on large updates.

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

/** Key-order-independent JSON, for content equality checks (materialized doc
 * output has different key order than stored configs, so plain JSON.stringify
 * comparisons produce false differences). */
export function canonicalJson(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.keys(val as object).sort().reduce(
        (a: Record<string, unknown>, k) => {
          a[k] = (val as Record<string, unknown>)[k];
          return a;
        },
        {},
      )
      : val
  );
}

/** LWW set of a primitive value; deletes on undefined; no-op when unchanged. */
export function setScalar(m: Y.Map<unknown>, key: string, value: unknown): void {
  if (value === undefined) {
    if (m.has(key)) {
      m.delete(key);
    }
  } else if (m.get(key) !== value) {
    m.set(key, value);
  }
}

// Remembers the last object reference written per (node map, key) so an
// unchanged opaque value (e.g. a large figure bundle, kept by reference via the
// editor's structural sharing) is a cheap reference check rather than a
// re-serialization on every keystroke.
//
// INVARIANT: callers must pass structurally-shared opaque values — a changed
// value must be a NEW object. If an edit mutates the value in place (keeping the
// same reference), the reference check below skips the write and the change is
// silently dropped. In the editors this means using a path set
// (setStore("layout", ...)) or a fresh `{...prev, [id]: next}` spread for
// figure/style/registry edits, NOT reconcile(), which merges into the existing
// object in place.
const lastOpaqueRef = new WeakMap<Y.Map<unknown>, Map<string, unknown>>();

/** LWW set of an opaque JSON value (figure bundles, style records). */
export function setOpaque(m: Y.Map<unknown>, key: string, value: unknown): void {
  let cache = lastOpaqueRef.get(m);
  if (!cache) {
    cache = new Map();
    lastOpaqueRef.set(m, cache);
  }
  if (value === undefined) {
    if (m.has(key)) {
      m.delete(key);
    }
    cache.delete(key);
    return;
  }
  if (cache.get(key) === value) {
    return; // same reference -> unchanged
  }
  if (!m.has(key) || canonicalJson(m.get(key)) !== canonicalJson(value)) {
    m.set(key, value);
  }
  cache.set(key, value);
}

/**
 * LWW set of an opaque JSON value, compared BY VALUE (canonicalJson) rather than
 * by reference. Unlike setOpaque there is no WeakMap fast path, so it is robust
 * against callers that mutate a value IN PLACE (keeping the same object
 * reference) — which is exactly what a nested Solid store path-set does
 * (`setStore("d", "filterBy", 0, "values", ...)` mutates the raw object).
 *
 * Use this for small opaque sub-values (a figure config's filter/style arrays,
 * a period filter) where the reference-fresh discipline of setOpaque cannot be
 * guaranteed. Do NOT use it for large blobs (figure bundles with embedded items/
 * GeoJSON) — the unconditional canonicalJson serialization would be too costly;
 * setOpaque's reference cache exists for those. Deletes on undefined; no-op when
 * the stored value is already canonically equal.
 */
export function setOpaqueByValue(
  m: Y.Map<unknown>,
  key: string,
  value: unknown,
): void {
  if (value === undefined) {
    if (m.has(key)) {
      m.delete(key);
    }
    return;
  }
  if (!m.has(key) || canonicalJson(m.get(key)) !== canonicalJson(value)) {
    // Store a structural CLONE, never the caller's reference: Yjs holds plain
    // objects by reference, so aliasing the caller's object would let a later
    // in-place mutation of it silently change the stored value — making the
    // NEXT canonicalJson compare a false no-op that drops the edit. The clone
    // breaks that aliasing. Values here are small, so the clone is cheap.
    m.set(key, structuredClone(value));
  }
}

/** Apply the edits that turn `yText` into `next` as SEPARATE per-region ops
 *  (line-anchored diff), not one giant splice. Multiple hunks matter for
 *  attribution and co-editing: a full-body REST save routed through a live
 *  room used to rewrite everything between the first and last difference as
 *  one delete+insert — tombstoning untouched text as "deleted by" the caller,
 *  re-attributing it to them, and reverting co-editors' edits in the span.
 *  Regions the diff can't anchor still collapse to a single splice (the old
 *  behavior), so the result is always exactly `next`. */
export function syncText(yText: Y.Text, next: string): void {
  const cur = yText.toString();
  if (cur === next) {
    return;
  }
  const maxPre = Math.min(cur.length, next.length);
  let p = 0;
  while (p < maxPre && cur[p] === next[p]) {
    p++;
  }
  let s = 0;
  while (s < maxPre - p && cur[cur.length - 1 - s] === next[next.length - 1 - s]) {
    s++;
  }
  const midCur = cur.slice(p, cur.length - s);
  const midNext = next.slice(p, next.length - s);
  // Apply back-to-front so earlier hunks' offsets stay valid.
  const hunks = diffTextHunks(midCur, midNext);
  for (let i = hunks.length - 1; i >= 0; i--) {
    const h = hunks[i];
    if (h.toA > h.fromA) {
      yText.delete(p + h.fromA, h.toA - h.fromA);
    }
    if (h.toB > h.fromB) {
      yText.insert(p + h.fromA, midNext.slice(h.fromB, h.toB));
    }
  }
}

// ── Line-anchored text diff (patience) ───────────────────────────────────────
// Replacing [fromA, toA) of A with [fromB, toB) of B for every hunk turns A
// into B. Hunks are line-aligned via unique-common-line anchors (patience
// diff), then char-trimmed at the edges. Regions without anchors become one
// hunk — never wrong, just coarser.

type TextHunk = { fromA: number; toA: number; fromB: number; toB: number };

function splitLines(s: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\n") {
      out.push(s.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < s.length) {
    out.push(s.slice(start));
  }
  return out;
}

/** Longest increasing subsequence (indices into `values`). */
function lisIndices(values: number[]): number[] {
  const tailIdx: number[] = [];
  const prev = new Array<number>(values.length).fill(-1);
  for (let i = 0; i < values.length; i++) {
    let lo = 0;
    let hi = tailIdx.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (values[tailIdx[mid]] < values[i]) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    if (lo > 0) {
      prev[i] = tailIdx[lo - 1];
    }
    tailIdx[lo] = i;
  }
  const out: number[] = [];
  let k = tailIdx.length > 0 ? tailIdx[tailIdx.length - 1] : -1;
  while (k !== -1) {
    out.push(k);
    k = prev[k];
  }
  return out.reverse();
}

function patienceLineHunks(
  a: string[],
  aLo: number,
  aHi: number,
  b: string[],
  bLo: number,
  bHi: number,
  out: TextHunk[],
): void {
  while (aLo < aHi && bLo < bHi && a[aLo] === b[bLo]) {
    aLo++;
    bLo++;
  }
  while (aHi > aLo && bHi > bLo && a[aHi - 1] === b[bHi - 1]) {
    aHi--;
    bHi--;
  }
  if (aLo === aHi && bLo === bHi) {
    return;
  }
  if (aLo === aHi || bLo === bHi) {
    out.push({ fromA: aLo, toA: aHi, fromB: bLo, toB: bHi });
    return;
  }
  // Lines occurring exactly once on BOTH sides are reliable anchors.
  const countA = new Map<string, number>();
  for (let i = aLo; i < aHi; i++) {
    countA.set(a[i], (countA.get(a[i]) ?? 0) + 1);
  }
  const countB = new Map<string, number>();
  const posB = new Map<string, number>();
  for (let i = bLo; i < bHi; i++) {
    countB.set(b[i], (countB.get(b[i]) ?? 0) + 1);
    posB.set(b[i], i);
  }
  const pairs: { ai: number; bi: number }[] = [];
  for (let i = aLo; i < aHi; i++) {
    if (countA.get(a[i]) === 1 && countB.get(a[i]) === 1) {
      pairs.push({ ai: i, bi: posB.get(a[i])! });
    }
  }
  if (pairs.length === 0) {
    out.push({ fromA: aLo, toA: aHi, fromB: bLo, toB: bHi });
    return;
  }
  // pairs are sorted by ai; keep the longest chain also increasing in bi.
  const chain = lisIndices(pairs.map((p) => p.bi)).map((i) => pairs[i]);
  let prevA = aLo;
  let prevB = bLo;
  for (const anchor of chain) {
    patienceLineHunks(a, prevA, anchor.ai, b, prevB, anchor.bi, out);
    prevA = anchor.ai + 1;
    prevB = anchor.bi + 1;
  }
  patienceLineHunks(a, prevA, aHi, b, prevB, bHi, out);
}

/** Char-offset hunks that turn `aStr` into `bStr`, line-anchored then
 *  char-trimmed. Exported for the harness. */
export function diffTextHunks(aStr: string, bStr: string): TextHunk[] {
  if (aStr === bStr) {
    return [];
  }
  const a = splitLines(aStr);
  const b = splitLines(bStr);
  const lineHunks: TextHunk[] = [];
  patienceLineHunks(a, 0, a.length, b, 0, b.length, lineHunks);
  // Line index -> char offset.
  const offA = new Array<number>(a.length + 1);
  offA[0] = 0;
  for (let i = 0; i < a.length; i++) {
    offA[i + 1] = offA[i] + a[i].length;
  }
  const offB = new Array<number>(b.length + 1);
  offB[0] = 0;
  for (let i = 0; i < b.length; i++) {
    offB[i + 1] = offB[i] + b[i].length;
  }
  const out: TextHunk[] = [];
  for (const h of lineHunks) {
    let fromA = offA[h.fromA];
    let toA = offA[h.toA];
    let fromB = offB[h.fromB];
    let toB = offB[h.toB];
    // Char-level trim within the hunk.
    while (fromA < toA && fromB < toB && aStr[fromA] === bStr[fromB]) {
      fromA++;
      fromB++;
    }
    while (toA > fromA && toB > fromB && aStr[toA - 1] === bStr[toB - 1]) {
      toA--;
      toB--;
    }
    if (fromA === toA && fromB === toB) {
      continue;
    }
    out.push({ fromA, toA, fromB, toB });
  }
  return out;
}
