// =============================================================================
// Shared CRDT utilities (Yjs) — used by both document bridges
// =============================================================================
//
// Content-agnostic helpers shared by the slide and report Y.Doc bridges
// (slide_crdt.ts / report_crdt.ts). Nothing in here knows about slides or
// reports. Runs on both the Deno server and the Vite client.

import * as Y from "yjs";

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
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
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
    if (m.has(key)) m.delete(key);
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
    if (m.has(key)) m.delete(key);
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
    if (m.has(key)) m.delete(key);
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

/** Apply the minimal single-region edit to turn `yText` into `next`. */
export function syncText(yText: Y.Text, next: string): void {
  const cur = yText.toString();
  if (cur === next) return;
  const maxPre = Math.min(cur.length, next.length);
  let p = 0;
  while (p < maxPre && cur[p] === next[p]) p++;
  let s = 0;
  while (s < maxPre - p && cur[cur.length - 1 - s] === next[next.length - 1 - s]) {
    s++;
  }
  const delLen = cur.length - p - s;
  if (delLen > 0) yText.delete(p, delLen);
  const ins = next.slice(p, next.length - s);
  if (ins.length > 0) yText.insert(p, ins);
}
