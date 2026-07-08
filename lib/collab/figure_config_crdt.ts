// =============================================================================
// Figure-config CRDT bridge (Yjs) — shared by both visualization-collab surfaces
// =============================================================================
//
// A visualization's editable config is `PresentationObjectConfig = { d, s, t }`.
// This module maps it onto a Y.Map so two people editing the SAME config in the
// visualization editor merge field-by-field (different fields never clobber),
// with same-field last-writer-wins and character-level merge on the three free-
// text fields. It is a bridge over a Y.MAP (not a whole Y.Doc), so the identical
// code binds both:
//   * the standalone PO room's doc root   — doc.getMap("config")
//   * a figure node inside a slide/report — the node's "figConfig" nested map
//
// Shape (configMap is the map handed in):
//   "d": Y.Map  — query config. Primitives (type, timeseriesGrouping, ...) are
//                 LWW scalars; arrays/objects (disaggregateBy, filterBy,
//                 periodFilter, valuesFilter) are whole-value LWW.
//   "s": Y.Map  — style + conditional-formatting. Same rule: flat scalars LWW,
//                 arrays (customSeriesStyles, cf threshold arrays) whole-value.
//   "t": Y.Map  — caption / subCaption / footnote as Y.Text (character merge +
//                 remote carets); the *RelFontSize numbers are LWW scalars.
//
// Arrays are replaced whole in the editor UI (and by the AI patch surface), so
// whole-value LWW per array is the real editing granularity — decomposing them
// into Y.Arrays would buy nothing. Classification is by runtime value type
// (primitive vs object), not a hardcoded key list, so it survives schema growth.
//
// Runs on both the Deno server and the Vite client.

import * as Y from "yjs";
import type { PresentationObjectConfig } from "../types/_presentation_object_config.ts";
import { setOpaqueByValue, setScalar, syncText } from "./crdt_util.ts";

/** The Y.Doc map key holding a standalone visualization's config (the PO room
 *  doc root). Shared by the server adapter and the client session so they never
 *  drift. Slide/report figure nodes instead nest the config under "figConfig". */
export const PO_CONFIG_MAP_KEY = "config";

const SECTIONS = ["d", "s", "t"] as const;
type Section = (typeof SECTIONS)[number];

/** The `t` fields modelled as Y.Text (the only free-text in the whole config). */
const CAPTION_TEXT_KEYS = ["caption", "subCaption", "footnote"] as const;
export type CaptionTextKey = (typeof CAPTION_TEXT_KEYS)[number];
const CAPTION_TEXT_SET: ReadonlySet<string> = new Set(CAPTION_TEXT_KEYS);

/** Arrays and plain objects are opaque (whole-value LWW); everything else is a
 *  primitive scalar. null is treated as a scalar (delete-or-set), not opaque. */
function isOpaqueValue(v: unknown): boolean {
  return typeof v === "object" && v !== null;
}

function newCaptionText(value: unknown): Y.Text {
  const t = new Y.Text();
  if (typeof value === "string" && value.length > 0) t.insert(0, value);
  return t;
}

// ── Seed: config -> (assumed empty) Y.Map ────────────────────────────────────

/** Populate an empty config map from a PresentationObjectConfig. */
export function seedFigureConfigMap(
  configMap: Y.Map<unknown>,
  config: PresentationObjectConfig,
): void {
  for (const section of SECTIONS) {
    const sub = new Y.Map<unknown>();
    configMap.set(section, sub);
    const obj = (config[section] ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      if (section === "t" && CAPTION_TEXT_SET.has(k)) sub.set(k, newCaptionText(v));
      else sub.set(k, v); // scalar OR opaque — Yjs stores the JSON value as-is
    }
    // Caption Y.Texts always exist (even when empty) so the editor can bind a
    // CodeMirror to them and a peer can type into an empty caption. Check the
    // source object (not sub.get) so we never read a still-detached Y.Map.
    if (section === "t") {
      for (const key of CAPTION_TEXT_KEYS) {
        if (obj[key] === undefined) sub.set(key, newCaptionText(""));
      }
    }
  }
}

// ── Materialize: Y.Map -> config ─────────────────────────────────────────────

/** Project the config map back into a PresentationObjectConfig. Reads every key
 *  present; the server re-validates with presentationObjectConfigSchema before
 *  persisting (a plain z.object strips any unknown key a newer client wrote, so
 *  reading forward-written keys here can never make the checkpoint parse throw). */
export function materializeFigureConfig(
  configMap: Y.Map<unknown>,
): PresentationObjectConfig {
  const out: Record<string, unknown> = {};
  for (const section of SECTIONS) {
    const sub = configMap.get(section);
    const obj: Record<string, unknown> = {};
    if (sub instanceof Y.Map) {
      for (const [k, v] of sub.entries()) {
        if (v instanceof Y.Text) obj[k] = v.toString();
        // Deep-clone opaque objects/arrays: Yjs returns them by reference, so
        // an unclone would let the consumer (a Solid store via reconcile) alias
        // the live doc and mutate it out-of-band. Primitives need no clone.
        else if (typeof v === "object" && v !== null) obj[k] = structuredClone(v);
        else obj[k] = v;
      }
    }
    out[section] = obj;
  }
  return out as unknown as PresentationObjectConfig;
}

// ── Reconcile: apply a target config onto an existing Y.Map (minimal ops) ─────

function syncSection(
  sub: Y.Map<unknown>,
  section: Section,
  obj: Record<string, unknown>,
): void {
  const present = new Set(
    Object.keys(obj).filter((k) => obj[k] !== undefined),
  );
  // Drop keys no longer in the target (a cleared optional filter/replicant).
  // Caption Y.Texts are kept and cleared to "" instead of deleted, so a bound
  // editor never loses its Y.Text.
  for (const k of [...sub.keys()]) {
    if (present.has(k)) continue;
    if (section === "t" && CAPTION_TEXT_SET.has(k)) {
      const t = sub.get(k);
      if (t instanceof Y.Text) syncText(t, "");
      continue;
    }
    sub.delete(k);
  }
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (section === "t" && CAPTION_TEXT_SET.has(k)) {
      let t = sub.get(k);
      if (!(t instanceof Y.Text)) {
        t = new Y.Text();
        sub.set(k, t);
      }
      syncText(t as Y.Text, typeof v === "string" ? v : "");
    } else if (isOpaqueValue(v)) {
      setOpaqueByValue(sub, k, v);
    } else {
      setScalar(sub, k, v);
    }
  }
}

/** Diff a full config onto the map (minimal mergeable ops). Idempotent — a
 *  no-op when the map already matches, so it is safe to call unconditionally
 *  (the standalone editor's full-store push, like the slide editor's). */
export function syncFigureConfigToMap(
  configMap: Y.Map<unknown>,
  config: PresentationObjectConfig,
): void {
  for (const section of SECTIONS) {
    let sub = configMap.get(section);
    if (!(sub instanceof Y.Map)) {
      sub = new Y.Map<unknown>();
      configMap.set(section, sub);
    }
    syncSection(
      sub as Y.Map<unknown>,
      section,
      (config[section] ?? {}) as Record<string, unknown>,
    );
  }
}

/** Set a single config field (partial write) — used by the batch period-filter
 *  chokepoint, which touches only d.periodFilter. undefined clears the field. */
export function syncFigureConfigField(
  configMap: Y.Map<unknown>,
  section: Section,
  key: string,
  value: unknown,
): void {
  let sub = configMap.get(section);
  if (!(sub instanceof Y.Map)) {
    sub = new Y.Map<unknown>();
    configMap.set(section, sub);
  }
  const m = sub as Y.Map<unknown>;
  if (section === "t" && CAPTION_TEXT_SET.has(key)) {
    let t = m.get(key);
    if (!(t instanceof Y.Text)) {
      t = new Y.Text();
      m.set(key, t);
    }
    syncText(t as Y.Text, typeof value === "string" ? value : "");
  } else if (isOpaqueValue(value)) {
    setOpaqueByValue(m, key, value);
  } else {
    setScalar(m, key, value);
  }
}

/** The caption/subCaption/footnote Y.Text, for binding a CodeMirror, or
 *  undefined if the map has not been seeded yet. */
export function findFigureCaptionText(
  configMap: Y.Map<unknown>,
  key: CaptionTextKey,
): Y.Text | undefined {
  const sub = configMap.get("t");
  if (!(sub instanceof Y.Map)) return undefined;
  const t = sub.get(key);
  return t instanceof Y.Text ? t : undefined;
}
