# PLAN — HFA Feature Set

Catalogue of the HFA module/data features the FASTR team wants, ordered **easiest → hardest**. Each item records the problem, the design decisions already settled in discussion, open questions, rough effort, repos touched, and the grounding files. We work through them top-to-bottom; nothing here is implemented yet.

> Scope note: this plan covers labels, dataset-row removal, the service-category filter, carry-forward, and a self-contained HFA indicator-manager AI assistant. The original "iron out upload bugs" and "'other' coding with AI" notes are **parked** at the bottom — not in active scope.

---

## Cross-cutting context (grounding)

- **Indicator model:** `HfaIndicator` has `shortLabel` + `definition` (no `longLabel` field — the editor UI already *calls* `definition` the "Long label"). Display today resolves as `shortLabel || definition` ([get_indicator_metadata.ts:91](server/server_only_funcs_presentation_objects/get_indicator_metadata.ts#L91), [datasets_in_project_hfa.ts:419](server/db/project/datasets_in_project_hfa.ts#L419)). In real data (`_HFA_test_data/hfa_indicators.xlsx`) **short labels are empty everywhere** and long labels are verbose, with redundant repeated stems ("shock in last three months: …").
- **Indicators are instance-level** ("Data" → HFA Indicators), authored via xlsx workbook ([_xlsx_workbook.ts](client/src/components/indicator_manager_hfa/_xlsx_workbook.ts)) and edited in [client/src/components/indicator_manager_hfa/](client/src/components/indicator_manager_hfa/).
- **Full write+validate backend already exists** ([server/db/instance/hfa_indicators.ts](server/db/instance/hfa_indicators.ts)): `createHfaIndicator`, `updateHfaIndicator`, `deleteHfaIndicators`, `batchUploadHfaIndicators`, `saveHfaIndicatorFull`, `bulkUpdateHfaIndicatorValidation`, `getHfaDictionaryForValidation` (raw survey variable dictionary: vars + values + labels per round), `updateHfaIndicatorCode`.
- **Data grain:** HFA indicators are computed per **facility × time-point (round)** via per-round `r_code` (e.g. `chal_01_a==1`), then weighted up to admin areas. Facility granularity exists **only inside the R module** — by viz-query time data is aggregated.
- **Service categories are many-to-many** (`serviceCategoryIds: string[]`), flattened to a pipe-joined composite for the disaggregation system: `hfa_service_category = "rmnch|nutrition"` ([get_script_with_parameters_hfa.ts:270](server/server_only_funcs/get_script_with_parameters_hfa.ts#L270)).
- **Three repos move together** where noted: this app, `wb-fastr-modules` (R scripts + regenerated `definition.json`), and panther.

---

## 1. Inferred measure (was: "label prefix")  ·  effort S  ·  app only  ·  ✅ IMPLEMENTED

**Problem.** The measurement of an indicator (a % of facilities vs an average vs a total) is fully determined by `(type, aggregation)`, and authors shouldn't have to encode it by retyping a stem ("Percentage of facilities with …") on every indicator.

**Decisions settled (as built).**
- The measure is **inferred from `(type, aggregation)`** in one lib lookup — **not** a stored field (avoids the snapshot/cache-drift class of bug). Lives in `lib/hfa_indicator_labels.ts`: `getHfaIndicatorMeasure(type, aggregation) → { kind: "percent"|"number"; label: TranslatableString }`.
- **It is surfaced as a SEPARATE annotation, never concatenated into the label.** Concatenation was tried and rejected — on real data it produced "Total total number of…" and ungrammatical "Percentage of facilities with has service delivery changed…", and it forced a mixed-language path. The separate annotation keeps the author's label untouched.
- **Scope: AI-facing only** (Tim's steer: "in a bar chart we'd want just the shortened version… but for exposing to AI it'd be good to use the prefix"). The measure renders in the AI taxonomy as `… [% of facilities]` ([format_metrics_list_for_ai.ts](client/src/components/project_ai/ai_tools/tools/_internal/format_metrics_list_for_ai.ts)). **Charts/axes/legends/tables/exports deliberately do NOT show it** — they use the compact short label (item 2).
- `kind` is the single source for `format_as` (replaced the inline `binary && avg ? "percent" : "number"`).

**Deferred (not built).** A standalone-label surface (e.g. a single-indicator KPI title) could compose a full "Percentage of facilities with {label}" phrase — Tim was unsure there are many such use cases. The lookup is ready for it; no UI consumer wired yet.

**Key files.** `lib/hfa_indicator_labels.ts` (new), `lib/types/hfa_types.ts` (`HfaTaxonomyForAI.indicators.measure`), `server/db/project/datasets_in_project_hfa.ts`, `server/server_only_funcs_presentation_objects/get_indicator_metadata.ts`.

---

## 2. Short vs long label usage  ·  effort S  ·  app only  ·  ✅ IMPLEMENTED (partially wired)

**Problem.** Display blindly used `shortLabel || definition`, so when a short label exists it's used even where the full text would be better, and when it's absent the long sentence is jammed into compact slots.

**Decisions settled (as built).**
- `composeHfaIndicatorLabel(fields, context)` with `context: "compact" | "full"` — `compact` = `short || long` (for axis/legend/chips/bars), `full` = `long || short` (for tooltips/titles/headers/exports). Both trim. No prefix in either — the measure (item 1) is separate.
- `definition` *is* the long label — no schema change.

**Wired today.** Charts/disaggregation labels use `compact` ([get_indicator_metadata.ts](server/server_only_funcs_presentation_objects/get_indicator_metadata.ts)). The AI taxonomy uses `full` ([datasets_in_project_hfa.ts](server/db/project/datasets_in_project_hfa.ts)). So compact's win — a clean short label in dense slots — only *materialises* once short labels exist (today they're empty; Tier-A AI, item 4, fills them).

**Not yet wired (the `full` context's UI home).** Tooltips / chart titles / table headers / exports still receive the single `compact` label from the viz pipeline; the `full` context is exercised only by the AI path. Pointing those UI surfaces at `full` is a small follow-up if/when wanted — deliberately out of scope until there's demand.

**Key files.** `lib/hfa_indicator_labels.ts` — items 1 & 2 ship as one label-resolution layer.

---

## 3. Remove dataset rows in-platform  ·  effort M  ·  app only

**Problem.** Need to delete rows after ingest so ODK→platform direct upload stays usable, while keeping a manual re-run/weights-check path.

**Decisions settled.**
- Priority is **hard-delete** (keep the dataset clean for ODK-direct), with the manual full re-upload/re-run path **retained** for weights checking.

**Open questions.**
- UI entry point: at the upload/stage review step vs. a row browser on an integrated dataset version.
- Selection model: delete by facility, by round, by predicate, or row-level multi-select.
- Versioning: does a delete create a new dataset version (cache key advance, history) — almost certainly yes, mirror the integrate path.
- Re-validation/weights recompute trigger after deletion.

**Key files.** [DOC_IMPORT_PIPELINE.md](DOC_IMPORT_PIPELINE.md), `server/worker_routines/integrate_hfa_data/`, `server/db/instance/dataset_hfa.ts`, dataset-version handling + Valkey cache invalidation.

---

## 4. HFA AI assistant — Tier A: batch label / category authoring  ·  effort M  ·  app only

**Problem.** Filling 240 short labels and cleaning long labels by hand is painful. This is the **fast-track slice** of the killer AI feature and it directly supercharges items 1 & 2.

**Decisions settled.**
- **Self-contained AI layer that lives ONLY inside the HFA Indicator Manager.** Clean separation from `project_ai` tools/assistant — accept minor plumbing duplication for isolation. Do **not** build instance-level AI.
- Reuse only: the **Anthropic proxy** ([DOC_AI_PROXY_AND_USAGE_GOVERNANCE.md](DOC_AI_PROXY_AND_USAGE_GOVERNANCE.md)) and the **existing CRUD/validation backend** (see cross-cutting context).
- Tier A is **low-risk and reversible**: pure text/metadata edits on existing indicators (short labels, long-label cleanup, category & service-category assignment), human-reviewed, re-importable.

**Scope.** New embedded chat panel + a small, indicator-scoped tool set: read current indicators, propose batch label/category edits, write via `batchUploadHfaIndicators`/`saveHfaIndicatorFull`. No `r_code` authoring yet.

**Open questions.**
- Tool/chat harness: lift a minimal copy from `project_ai`, or build fresh.
- Review/confirm UX before edits commit (diff preview + accept).

**Key files.** [client/src/components/indicator_manager_hfa/](client/src/components/indicator_manager_hfa/), `server/ai/`, [server/db/instance/hfa_indicators.ts](server/db/instance/hfa_indicators.ts).

---

## 5. Service-category membership filter  ·  effort M–L  ·  app only (new capability)

**Problem.** Service categories are many-to-many but flattened to a pipe-joined composite, so the disaggregation system sees `"rmnch|nutrition"` as one opaque value — you can't cleanly "filter to indicators in rmnch". This opens genuinely new functionality in the filter system.

**Decisions settled.**
- **Filter-only, never a disaggregator.** Disaggregating a many-to-many dimension double-counts (an indicator in two categories feeds both group sums). Restrict to membership filtering: "include indicators whose `serviceCategoryIds` contains X".
- Replace the pipe-join workaround for the *filter* path with a real set-membership test.

**Open questions.**
- Storage/query shape: keep the joined string and match with a contains/`ANY` test, or carry `serviceCategoryIds` as a proper array/lookup into the query layer.
- Filter UX: multi-select chips on the viz; single vs OR-of-many membership.
- Whether `hfa_service_category` stays in `ALL_DISAGGREGATION_OPTIONS` (as disagg) or is reclassified filter-only.
- Cache-key implications (filter participates in the fetch config hash).

**Key files.** [DOC_PRESENTATION_OBJECT_QUERY_PIPELINE.md](DOC_PRESENTATION_OBJECT_QUERY_PIPELINE.md), `server/server_only_funcs_presentation_objects/cte_manager.ts`, `get_combined_query.ts`, `query_helpers.ts`, `get_possible_values.ts`, [lib/types/disaggregation_options.ts](lib/types/disaggregation_options.ts), filter UI in `client/`.

---

## 6. HFA AI assistant — Tier B: structural edits + validation repair  ·  effort M–L  ·  app only

**Problem.** Beyond labels: recategorize in bulk, reassign service categories, and **fix validation errors** (the "4 error / 4 ready" status) with the AI iterating against the validation loop.

**Decisions settled.**
- Builds on Tier A's self-contained panel + tools. Adds the **validation feedback loop** (`bulkUpdateHfaIndicatorValidation` / revalidate) so the AI sees errors and retries.
- Still no net-new indicator generation — operates on existing indicators' fields incl. `r_code` edits, with the validator as the safety net.

**Open questions.**
- How much `r_code` editing to allow here vs. defer fully to Tier C.
- Guardrails: cap batch size, require human accept on `r_code` changes.

**Key files.** As Tier A, plus `updateHfaIndicatorCode`, `getHfaDictionaryForValidation`, the revalidate route.

---

## 7. Carry-forward fallback (USE_PREVIOUS / USE_NEXT)  ·  effort L  ·  app + wb-fastr-modules

**Problem.** When a facility has no value for an indicator in a round, optionally **carry the same facility's value from the previous (or next) round** — at the **facility level**, as a **fallback**: keep the real `r_code`, fall back only when it yields missing (NA).

**Decisions settled.**
- Semantics: **fallback, not replacement** — real code runs first; carry only fills the NA. Lookup is per **facility × indicator × round**.
- Must run **inside the R module** (only place facility granularity exists, before weighting).

**Design fork (my recommendation: dedicated field, not a sentinel-in-`r_code`).**
- The fallback property *requires keeping the real `r_code`*, so a replacement sentinel (`r_code = USE_PREV`) can't express "compute, then fall back". A **separate per-round fallback policy** (`none | prev | next`) alongside `r_code__Round N` keeps "how to compute" and "what if missing" cleanly separated, validates without overloading the r_code parser, and shows as its own editor column.
- Grain mirrors existing `r_code__Round N` / `r_filter_code__Round N`.

**Open questions.**
- Confirm which module consumes the HFA workbook params (anchor: [get_script_with_parameters_hfa.ts](server/server_only_funcs/get_script_with_parameters_hfa.ts)). Note `m004`/`m005`/`m006` already do **admin-area × year** `zoo::na.locf` carry-forward for projections — *different mechanism*; don't conflate.
- Chained gaps (round 3 missing → 2 also missing → fall to 1?) and prev/next conflict resolution.
- Whole-round-absent vs present-but-NA — both should be covered.

**Touches (cross-repo, in lockstep).** Workbook schema + parser, `hfa_indicators` schema/types/Zod, project snapshot tables ([datasets_in_project_hfa.ts](server/db/project/datasets_in_project_hfa.ts)), param injection, the **R script** in `wb-fastr-modules` (+ regenerated `definition.json`), editor UI, validation/status.

---

## 8. HFA AI assistant — Tier C: generate indicators from raw variables  ·  effort L  ·  app only (the killer)

**Problem.** The big prize: point the AI at the available survey variables and have it **author net-new indicators** — `r_code` per round, labels, type/aggregation, categorization — self-validate, human approves.

**Decisions settled.**
- Staged **last**, but Tiers A/B deliberately build the tools it needs (read indicators, read variable dictionary, validate). The only hard prerequisite — an AI surface — is already solved by Tier A's self-contained panel.
- Bounded risk: generation gated behind `getHfaDictionaryForValidation` (knows the real variables/values) + the validation loop + a **human-approval gate** before an indicator goes "ready".

**Open questions.**
- `select_multiple` expansion + `r_filter_code` handling in generated code.
- How aggressively to auto-generate vs. propose-and-confirm.
- Quality eval: how we measure generated-r_code correctness.

**Key files.** As Tiers A/B, with emphasis on `getHfaDictionaryForValidation`, `createHfaIndicator`, the validation route.

---

## Parked (not in active scope)

- **Upload bugs** (admin areas / facilities / weights). The import doc flags real latent issues — three divergent SQL-escaping paths, fixed staging-table names with no concurrency lock, escaping on user data ([DOC_IMPORT_PIPELINE.md](DOC_IMPORT_PIPELINE.md) "What NOT to do"). Revisit once specific reproductions are in hand.
- **"Other" coding with AI** — future/exploratory; revisit after Tier C proves the indicator-authoring loop.

---

## Suggested sequencing

Items 1 → 2 ship as one label-resolution layer. Tier A (4) immediately follows to fill the empty short labels at scale. 3 and 5 are independent and can slot wherever. 7 (carry-forward) is the heaviest data-layer change and the only cross-repo item before the AI tiers. Tier C (8) is the milestone the earlier AI tiers are built toward.
