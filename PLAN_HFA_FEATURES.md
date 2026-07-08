# PLAN — HFA remaining work

Consolidated to-do list for HFA feature and sentinel-handling work. Shipped work
is omitted — this is only what's left. Effort (S/M/L), repos, and key files are
inline per item.

## Grounding (only what the to-dos rely on)

- **Indicator model.** `HfaIndicator` has `shortLabel` + `definition`
  (`definition` *is* the "long label"). Indicators are instance-level, authored
  via an xlsx workbook and edited in
  [client/src/components/indicator_manager_hfa/](client/src/components/indicator_manager_hfa/);
  full write+validate backend in
  [server/db/instance/hfa_indicators.ts](server/db/instance/hfa_indicators.ts).
- **Data grain.** Indicators compute per **facility × time-point (round)** via
  per-round `r_code`, then weight up to admin areas. Facility granularity exists
  **only inside the R module** ([get_script_with_parameters_hfa.ts](server/server_only_funcs/get_script_with_parameters_hfa.ts));
  by viz-query time data is aggregated.
- **Service categories** are many-to-many (`serviceCategoryIds: string[]`),
  flattened to a pipe-joined `hfa_service_category = "rmnch|nutrition"` for the
  disaggregation system.
- **Sentinel handling is live.** Import auto-classifies each `(question, code)`
  pair (`sentinel_class` on `hfa_variable_values`); the R generator computes each
  indicator under the `DONT_KNOW_TREATMENT` policy with **per-variable**
  missingness from the classification (snapshotted to
  `hfa_variable_values_snapshot`), falling back to the hardcoded
  `c(-99, -999999)` set for unclassified variables. Items 4–5 below are the
  remaining sentinel work.
- **Three repos move together** where noted: this app, `wb-fastr-modules` (R +
  regenerated `definition.json`), and panther.

---

## 1. Remove dataset rows in-platform · M · app-only

**Problem.** Delete rows after ingest so ODK→platform direct upload stays usable,
while keeping a manual re-run/weights-check path.

**Settled.** Hard-delete priority (keep the dataset clean for ODK-direct); retain
the manual full re-upload/re-run path for weights checking.

**Open.**

- UI entry point: upload/stage review step vs. a row browser on an integrated version.
- Selection model: by facility, by round, by predicate, or row-level multi-select.
- Versioning: a delete almost certainly creates a new dataset version (cache-key advance, history) — mirror the integrate path.
- Re-validation / weights-recompute trigger after deletion.

**Files.** [SYSTEM_06_ingestion.md](SYSTEM_06_ingestion.md),
`server/worker_routines/integrate_hfa_data/`,
`server/db/instance/dataset_hfa.ts`, dataset-version handling + Valkey cache
invalidation.

---

## 2. AI indicator-assistant hardening · S–M · app-only

First pass is shipped (self-contained assistant in
[client/src/components/indicator_manager_hfa/ai/](client/src/components/indicator_manager_hfa/ai/),
instance proxy [server/routes/instance/ai_proxy.ts](server/routes/instance/ai_proxy.ts),
all three tiers of tools with a per-write confirm gate). Remaining:

- **Visual-diff review UX (top gap).** `system_prompt.ts:46` promises writes are
  shown "with a diff", but they render as plain-text summary lines in a confirm
  dialog — build the diff/accept preview, or fix the prompt to match.
- **Taxonomy editing.** Assistant can *assign* categories but can't create/rename
  them — decide whether that stays manual.
- **No per-conversation cost cap** (only shared instance/user token limits);
  `max_tokens` hardcoded.
- `inspect_hfa_variable` loads the whole dataset display then filters
  client-side — fine now, unbounded at scale.
- No tests; no telemetry on tool accept/reject rate.
- Graduation from the `hfa-ai-testing` label/deploy to production.

**Files.** [client/src/components/indicator_manager_hfa/ai/](client/src/components/indicator_manager_hfa/ai/),
[server/routes/instance/ai_proxy.ts](server/routes/instance/ai_proxy.ts),
[SYSTEM_13_ai_assistant.md](SYSTEM_13_ai_assistant.md).

---

## 3. Sentinel Layer 1 — import review/correction UI · M · app-only

Auto-classification is shipped; this is the deferred human-correction step. A
review step in the import wizard, between staging (step 3,
`updateDatasetHfaStaging`) and finalize (step 4, `finalizeDatasetHfaIntegration`):
read the staged classification from the `DICT_VALUES_STAGING_TABLE` (created in
`main` via `createBulkImportConnection("main")`, so an ordinary `mainDb` route can
read/correct it), let the user reclassify sentinel rows via a class dropdown, and
persist corrections back to staging so finalize promotes the corrected values.

**Work.** New routes `getDatasetHfaStagedSentinels` / `updateDatasetHfaStagedSentinels`
(+ Zod + registry); DB read/update on the staging table; a new `Step` with the
stepper renumbered from 4 to 5 (`index.tsx` `getValidation` + `<Match>` arms).

**Files.** [client/src/components/instance_dataset_hfa_import/](client/src/components/instance_dataset_hfa_import/),
`server/routes/instance/datasets.ts`, `server/db/instance/dataset_hfa.ts`.

---

## 4. Sentinel Layer 3b — per-indicator override + authoring-rule gate · L · app + wb-fastr-modules

Layer 3a (per-variable generator) is shipped; 3b is the additive escape hatch +
validation:

- **Per-indicator sentinel-treatment override column** in the indicator
  dictionary — makes DK-rate indicators authorable (today the blanket missingness
  branch fires before any `x == -99` rCode could match).
- **Authoring-rule validation gate.** Indicator R code must test positively for
  Yes (`x == 1`, `x >= 3`); negated tests (`x != 2`, `x <= 3`) misclassify DK
  under DK-as-No. Not enforced anywhere today — a mis-authored `!=` indicator
  silently inverts DK handling. The override column is the natural home for the
  gate.

**Touches (cross-repo, lockstep).** `HfaIndicator`/`HfaIndicatorCode`
([lib/types/hfa_types.ts](lib/types/hfa_types.ts)),
`hfa_indicators`/`hfa_indicator_code` schema,
[server/db/instance/hfa_indicators.ts](server/db/instance/hfa_indicators.ts),
editor UI [client/src/components/indicator_manager_hfa/](client/src/components/indicator_manager_hfa/),
generator consumption in
[get_script_with_parameters_hfa.ts](server/server_only_funcs/get_script_with_parameters_hfa.ts),
and a per-class module parameter in `wb-fastr-modules` `m010` if the override
needs a policy knob.

---

## Parked / on-demand (not active)

- **Upload bugs** (admin areas / facilities / weights) — remaining latent issues live in [SYSTEM_06_ingestion.md](SYSTEM_06_ingestion.md) "Open items"; revisit with concrete repros.
- **"Other" (`-96`) coding with AI** — exploratory; revisit after the AI authoring loop proves out on real data.
- **Standalone-label surface** — compose a full "Percentage of facilities with {label}" for a single-indicator KPI title; the `getHfaIndicatorMeasure` lookup is ready, no UI consumer wired.
- **Wire the `full` label context** to tooltips / chart titles / table headers / exports (they get the compact label today) — small follow-up, on demand.
