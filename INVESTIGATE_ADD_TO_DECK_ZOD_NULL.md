# INVESTIGATE: "Add to slide deck" fails for AI-created visualizations (Zod / null)

## Status: OPEN — root cause NOT yet established. Handoff for fresh investigation.

This is a **real, user-reported bug** (multiple users hit it). A prior fix shipped
and appears to have helped in practice, but our subsequent investigation could
**not reproduce the mechanism from the code** — the explanation we (and the
original author) believed does not hold up. We need a fresh, empirical
investigation to find the *actual* cause before settling on a real fix.

---

## 1. Problem statement (user-facing symptom)

When the AI creates a visualization (a `from_metric` draft figure) and the user
clicks **"Add to slide deck"**, it fails. The original author (Nick) reported the
underlying failure as:

> "a zod error in `resolveFigureBundleFromMetric`. Some of the metrics the value
> label replacements field was undefined/blank and that was making the object for
> that value empty, making it not pass the zod validator."

The fix was first deployed in the ad-hoc `nick-testing-100` deploy and later
squashed into `main` as commit `f007f2c2`.

## 2. Goal

1. **Reproduce** the actual failure and capture the **exact Zod error message**
   (which field/object, which schema).
2. Identify the **true source** of the bad value.
3. Decide the **correct, robust fix location** (the user's strong steer: normalize
   a module definition fully **at install / ingestion**, so bad values never get
   stored/propagated — see §6).
4. Separately: the DB currently **stores `null`** for absent `valueLabelReplacements`.
   The user considers storing `null` *a priori* a problem worth fixing regardless
   of whether it is the cause here. Evaluate this.

---

## 3. Original fix attempt (commit `f007f2c2`, from `nick-testing-100`)

Three changes, two of which target the `from_metric` bundle path:

1. **`DraftVisualizationPreview.tsx` `handleAddToDeck`** — wrapped the body in
   `try/catch` and surfaces failures via `openAlert("Failed to add to slide deck")`.
   (Surfacing only; does not change the success path.)
2. **`client/src/components/slide_deck/slide_ai/build_config_from_metric.ts`** and
   **`client/src/generate_visualization/resolve_bundle_from_metric_and_config.ts`** —
   changed `valueLabelReplacements: x` to `valueLabelReplacements: x ? { ...x } : undefined`.

The author believed (2) fixed the Zod error by coercing a bad `valueLabelReplacements`
into `undefined`.

## 4. Why we thought it was the problem (and what we VERIFIED)

- **VERIFIED (harness):** the bundle's `resultsValue` schema
  (`resultsValueForVisualizationSchema`, `lib/types/_figure_bundle.ts:55`) is
  `z.record(z.string(), z.string()).optional()`. `.optional()` **accepts `undefined`,
  rejects `null`**:
  - `null` → FAIL (`expected record, received null`)
  - `undefined`, `{}`, `{a:'x'}` → PASS
- **VERIFIED:** the slide is Zod-parsed on add-to-deck via
  `slideConfigSchema.parse(...)` at `convert_ai_input_to_slide.ts:155`. A bundle
  whose `resultsValue.valueLabelReplacements` is `null` would fail there.
- **VERIFIED:** the installed-metric schema `metricStrict`
  (`lib/types/_metric_installed.ts:329`) is `.nullable()`, so `null` is a *plausible*
  stored value. The DB write stores `null` for absent (see §6).

So the theory was: a `null` `valueLabelReplacements` flows into the bundle → fails
`slideConfigSchema.parse` → add-to-deck throws. The `?? undefined` / `? {...} : undefined`
coercion would fix it.

## 5. Why that theory does NOT hold (the contradiction — also VERIFIED)

- The `from_metric` path's `metrics` come from **`projectState.metrics`**
  (`client/src/components/project_ai/index.tsx:95`, `chat_pane.tsx:205`).
- `projectState.metrics` is populated **only** via
  `setProjectState("metrics", reconcile(msg.data.metrics))`
  (`client/src/state/project/t1_store.ts:111`), from the `modules_updated` SSE
  payload (`server/task_management/notify_project_v2.ts`).
- That payload is built by **`getMetricsWithStatus` → `enrichMetric`**
  (`server/db/project/modules.ts:988` → `server/db/project/metric_enricher.ts:23`).
- **`enrichMetric` already coerces `value_label_replacements` `null → undefined`**
  (`metric_enricher.ts:60`), and has done so since **2026-01-21** (commit `5499143b`,
  ~5 months before the bug fix).

**Therefore:** the metric reaching the `from_metric` bundle path has
`valueLabelReplacements: undefined`, **never `null`**. So:
- `x ? {...x} : undefined` and `x ?? undefined` are **no-ops on this path**.
- The coercion **cannot** have fixed a `null`, because there is no `null` there.
- The proxy angle was also ruled out: a **real Solid store proxy** passes the Zod
  schema, `structuredClone`, and `JSON.stringify` (harness in §9). The shallow
  *copy* solved nothing.

The only remaining change that could affect behavior is the **try/catch** (which
surfaces errors but does not alter the success path).

**Net: we cannot reproduce the reported mechanism from current code. The real cause
is unknown.** The user's point stands: this does NOT explain the bug.

## 6. The "stored as null is a priori an issue" thread (separate but related)

The same conceptual field has **three representations**, which is itself a smell:

| Stage | File:line | Representation |
|---|---|---|
| GitHub module def (authored) | `lib/types/_module_definition_github.ts:298` | `z.record(...)` — **required** |
| Installed metric schema (stored) | `lib/types/_metric_installed.ts:329` | `.nullable()` — **null allowed** |
| App viz type | `lib/types/modules.ts` (`ResultsValue`, `ResultsValueForVisualization`) | `?: Record` — **undefined** |

- **Write/install** stores `null` for absent:
  `server/db/project/modules.ts:176` (and `:426`, `:488`):
  `valueLabelReplacements ? JSON.stringify(...) : null`
- **Read paths disagree:**
  - `metric_enricher.ts:60` → `undefined` ✅ (feeds the client)
  - `getMetricsForModule` `modules.ts:702` → `null` ❌ (only used by `routes/project/modules.ts:459`)
  - `load_module.ts:177` (github→loaded) → `null` for empty
- The user (who confirms the github-vs-installed difference is **intentional**)
  argues a module definition should be **fully normalised at install before
  storing**, so `null` never enters storage. Note: read-side normalization
  (`enrichMetric`) already covers *all* data including legacy rows; a write-side
  fix would not retroactively fix existing rows. Weigh both.

## 7. Open questions / hypotheses to test

1. **What is the actual Zod error?** Get the real message + the failing metric/PO
   id. It may name a **different field/object** than `valueLabelReplacements`
   (e.g. something else in the bundle: `config`, `indicatorMetadata`, `items`,
   `geo`, `dateRange`).
2. **Is the real fix just the try/catch?** i.e. the success path was actually fine
   in current `main`, and the user's "it works now" is the error being surfaced /
   a different change. Test add-to-deck end-to-end on current `main` WITHOUT any
   coercion.
3. **Is there a non-enriched path** by which a metric with `null` (or a raw
   `getMetricsForModule` result) reaches a bundle? (We believe not for `from_metric`,
   but confirm for `from_visualization` and the editor/dashboard/report paths.)
4. **Stored/legacy bundles:** could an already-saved slide/dashboard/report figure
   bundle contain `null` and fail on **re-parse** (load/edit), independent of fresh
   construction? Sinks that embed `figureBlockSchema`: `_slide_config.ts:68`,
   `_dashboard_config.ts:11`, `reports.ts:34`.
5. **Was the bug historical?** Did it predate some deploy and is it actually no
   longer reproducible? The `nick-testing-100` timeline vs `enrichMetric` (Jan)
   needs reconciling against when users reported it.
6. **Could `config` (not `resultsValue`) carry the bad value** that fails
   `slideConfigSchema.parse`? The bundle's `config` comes from `buildConfigFromPreset`
   spreading `preset.config.d`.

## 8. Current repo state (so you don't re-derive)

Commits from the prior session (local on `main`, **not pushed**):
- `f007f2c2` — original fix (try/catch + the two coercions). [Nick / squashed]
- `d232151b` — unrelated slide-editor "Add to slide deck" redirect message.
- `000d331d` — **reverted** the two coercions back to raw assignment.
- `bdcd9e4f` — deleted a misleading `PLAN_AI_PERIOD_FILTER_VERIFICATION.md` (unrelated).

**Uncommitted working-tree changes:** the two `from_metric` sites currently have
`valueLabelReplacements: x ?? undefined` (re-added during investigation). Given §5,
**these are no-ops** and should likely be reverted to the clean raw assignment
(the `000d331d` state) unless the investigation proves otherwise.

> NOTE: the working tree also contains a **large amount of unrelated parallel WIP**
> (visualization editor, panther, lib types, etc.). Do NOT stage/commit those.
> Touch only files you are deliberately changing.

## 9. Reproduction harnesses (re-runnable)

Run with: `deno run --allow-all -c deno.json <file>` from the repo root.

**A. Confirms `null` fails the bundle resultsValue schema:**
```ts
import { resultsValueForVisualizationSchema } from "/abs/path/lib/types/_figure_bundle.ts";
for (const [label, v] of [["undefined", undefined], ["null", null], ["{}", {}], ["record", {a:"x"}]] as const) {
  const r = resultsValueForVisualizationSchema.safeParse({ formatAs:"number", valueProps:["a"], valueLabelReplacements: v });
  console.log(label, r.success ? "PASS" : "FAIL -> " + r.error.issues[0].message);
}
// => null FAILs; undefined/{}/record PASS
```

**B. Confirms a real Solid store proxy is NOT the problem (copy was unnecessary):**
```ts
import { resultsValueForVisualizationSchema } from "/abs/path/lib/types/_figure_bundle.ts";
import { createStore } from "npm:solid-js@1.9.3/store";
const [store] = createStore({ metrics: [{ valueLabelReplacements: { count: "Count" } }] });
const p = store.metrics[0].valueLabelReplacements; // store proxy
console.log(resultsValueForVisualizationSchema.safeParse({ formatAs:"number", valueProps:["a"], valueLabelReplacements: p }).success); // true
structuredClone(p); JSON.stringify({ x: p }); // both OK
```

## 10. Key file/line reference index

- Symptom UI: `client/src/components/project_ai/ai_tools/DraftVisualizationPreview.tsx` (`handleAddToDeck`)
- from_metric bundle build: `client/src/generate_visualization/resolve_bundle_from_metric_and_config.ts`, `client/src/components/slide_deck/slide_ai/build_config_from_metric.ts`
- bundle assembly + return: `client/src/generate_visualization/resolve_figure_from_metric.ts` (`resolveFigureBundleFromMetric`)
- Zod parse on save: `client/src/components/slide_deck/slide_ai/convert_ai_input_to_slide.ts:155` (`slideConfigSchema.parse`)
- bundle schema (rejects null): `lib/types/_figure_bundle.ts:55` (`resultsValueForVisualizationSchema`), `:96` (`figureBundleSchema`)
- metric storage schema (nullable): `lib/types/_metric_installed.ts:329` (`metricStrict`)
- DB write (stores null): `server/db/project/modules.ts:176,426,488`
- read normalizers: `server/db/project/metric_enricher.ts:60` (→ undefined ✅), `server/db/project/modules.ts:702` (→ null ❌)
- client metrics source: `client/src/state/project/t1_store.ts:111` ← `getMetricsWithStatus` (`server/db/project/modules.ts:988`)
- bundle Zod sinks: `_slide_config.ts:68`, `_dashboard_config.ts:11`, `reports.ts:34`

## 11. Guidance for the next agent

- **Get the real error first.** Do not re-derive a mechanism from the schemas;
  reproduce the failure (or get the captured Zod error / failing id). The prior
  investigation went in circles by theorizing instead of reproducing.
- Treat §5 as established: the `from_metric` metric is already `undefined`, not
  `null`. If you find a `null` reaching a bundle, find the **specific path**.
- Keep the two concerns separate: (a) the **actual user bug** (unknown cause),
  (b) the **"store null" hygiene** issue (real but maybe not the cause).
