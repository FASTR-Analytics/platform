# PLAN — HFA Feature Set

Catalogue of the HFA module/data features the FASTR team wants. Items 1–2 and the AI assistant (item 6) are shipped; items 3–5 are the live unimplemented work. Each item records the problem, the design decisions already settled in discussion, open questions, rough effort, repos touched, and the grounding files.

> Scope note: labels/measure (1–2) and a self-contained HFA indicator-manager AI assistant (6) are built. Remaining feature work: dataset-row removal (3), service-category filter (4), carry-forward (5), plus hardening on the AI assistant. The original "iron out upload bugs" and "'other' coding with AI" notes are **parked** at the bottom.

---

## Cross-cutting context (grounding)

- **Indicator model:** `HfaIndicator` has `shortLabel` + `definition` (no `longLabel` field — the editor UI already *calls* `definition` the "Long label"). Display resolves through `composeHfaIndicatorLabel` (item 2); the AI measure annotation through `getHfaIndicatorMeasure` (item 1).
- **Indicators are instance-level** ("Data" → HFA Indicators), authored via xlsx workbook ([_xlsx_workbook.ts](client/src/components/indicator_manager_hfa/_xlsx_workbook.ts)) and edited in [client/src/components/indicator_manager_hfa/](client/src/components/indicator_manager_hfa/).
- **Full write+validate backend already exists** ([server/db/instance/hfa_indicators.ts](server/db/instance/hfa_indicators.ts)): `createHfaIndicator`, `updateHfaIndicator`, `deleteHfaIndicators`, `batchUploadHfaIndicators`, `saveHfaIndicatorFull`, `bulkUpdateHfaIndicatorValidation`, `getHfaDictionaryForValidation` (raw survey variable dictionary: vars + values + labels per round), `updateHfaIndicatorCode`.
- **Data grain:** HFA indicators are computed per **facility × time-point (round)** via per-round `r_code` (e.g. `chal_01_a==1`), then weighted up to admin areas. Facility granularity exists **only inside the R module** — by viz-query time data is aggregated.
- **Service categories are many-to-many** (`serviceCategoryIds: string[]`), flattened to a pipe-joined composite for the disaggregation system: `hfa_service_category = "rmnch|nutrition"` ([get_script_with_parameters_hfa.ts:370](server/server_only_funcs/get_script_with_parameters_hfa.ts#L370)).
- **Three repos move together** where noted: this app, `wb-fastr-modules` (R scripts + regenerated `definition.json`), and panther.

---

## 1. Inferred measure (was: "label prefix")  ·  effort S  ·  app only  ·  ✅ IMPLEMENTED

**Problem.** The measurement of an indicator (a % of facilities vs an average vs a total) is fully determined by `(type, aggregation)`, and authors shouldn't have to encode it by retyping a stem ("Percentage of facilities with …") on every indicator.

**Decisions settled (as built).**
- The measure is **inferred from `(type, aggregation)`** in one lib lookup — **not** a stored field (avoids the snapshot/cache-drift class of bug). Lives in `lib/hfa_indicator_labels.ts`: `getHfaIndicatorMeasure(type, aggregation) → { kind: "percent"|"number"; label: TranslatableString }`.
- **It is surfaced as a SEPARATE annotation, never concatenated into the label.** Concatenation was tried and rejected — on real data it produced "Total total number of…" and ungrammatical "Percentage of facilities with has service delivery changed…", and it forced a mixed-language path. The separate annotation keeps the author's label untouched.
- **Scope: AI-facing only** (Tim's steer: "in a bar chart we'd want just the shortened version… but for exposing to AI it'd be good to use the prefix"). The measure renders in the AI taxonomy as `… [% of facilities]` ([format_metrics_list_for_ai.ts](client/src/components/project_ai/ai_tools/tools/_internal/format_metrics_list_for_ai.ts)). **Charts/axes/legends/tables/exports deliberately do NOT show it** — they use the compact short label (item 2).
- `kind` is the single source for `format_as` ([get_indicator_metadata.ts:102](server/server_only_funcs_presentation_objects/get_indicator_metadata.ts#L102)).

**Deferred (not built).** A standalone-label surface (e.g. a single-indicator KPI title) could compose a full "Percentage of facilities with {label}" phrase — Tim was unsure there are many such use cases. The lookup is ready for it; no UI consumer wired yet.

**Key files.** `lib/hfa_indicator_labels.ts`, `lib/types/hfa_types.ts` (`HfaTaxonomyForAI.indicators.measure`), `server/db/project/datasets_in_project_hfa.ts`, `server/server_only_funcs_presentation_objects/get_indicator_metadata.ts`.

---

## 2. Short vs long label usage  ·  effort S  ·  app only  ·  ✅ IMPLEMENTED (partially wired)

**Problem.** Display blindly used `shortLabel || definition`, so when a short label exists it's used even where the full text would be better, and when it's absent the long sentence is jammed into compact slots.

**Decisions settled (as built).**
- `composeHfaIndicatorLabel(fields, context)` with `context: "compact" | "full"` — `compact` = `short || long` (for axis/legend/chips/bars), `full` = `long || short` (for tooltips/titles/headers/exports). Both trim. No prefix in either — the measure (item 1) is separate.
- `definition` *is* the long label — no schema change.

**Wired today.** Charts/disaggregation labels use `compact` ([get_indicator_metadata.ts:98-100](server/server_only_funcs_presentation_objects/get_indicator_metadata.ts#L98)). The AI taxonomy uses `full` ([datasets_in_project_hfa.ts:427](server/db/project/datasets_in_project_hfa.ts#L427)). Compact's payoff — a clean short label in dense slots — only materialises once short labels exist; the AI assistant (item 6) is the tool for filling them at scale. Whether real data still has empty short labels everywhere is **unverified** since the assistant shipped — was true at authoring time.

**Not yet wired (the `full` context's UI home).** Tooltips / chart titles / table headers / exports still receive the single `compact` label from the viz pipeline; the `full` context is exercised only by the AI path. Pointing those UI surfaces at `full` is a small follow-up if/when wanted — deliberately out of scope until there's demand.

**Key files.** `lib/hfa_indicator_labels.ts` — items 1 & 2 ship as one label-resolution layer.

---

## 3. Remove dataset rows in-platform  ·  effort M  ·  app only  ·  ⬜ REMAINING

**Problem.** Need to delete rows after ingest so ODK→platform direct upload stays usable, while keeping a manual re-run/weights-check path.

**Decisions settled.**
- Priority is **hard-delete** (keep the dataset clean for ODK-direct), with the manual full re-upload/re-run path **retained** for weights checking.

**Open questions.**
- UI entry point: at the upload/stage review step vs. a row browser on an integrated dataset version.
- Selection model: delete by facility, by round, by predicate, or row-level multi-select.
- Versioning: does a delete create a new dataset version (cache key advance, history) — almost certainly yes, mirror the integrate path.
- Re-validation/weights recompute trigger after deletion.

**Key files.** [SYSTEM_06_ingestion.md](SYSTEM_06_ingestion.md), `server/worker_routines/integrate_hfa_data/`, `server/db/instance/dataset_hfa.ts`, dataset-version handling + Valkey cache invalidation.

---

## 4. Service-category membership filter  ·  effort M–L  ·  app only (new capability)  ·  ⬜ REMAINING

**Problem.** Service categories are many-to-many but flattened to a pipe-joined composite, so the disaggregation system sees `"rmnch|nutrition"` as one opaque value — you can't cleanly "filter to indicators in rmnch". This opens genuinely new functionality in the filter system.

**Decisions settled.**
- **Filter-only, never a disaggregator.** Disaggregating a many-to-many dimension double-counts (an indicator in two categories feeds both group sums). Restrict to membership filtering: "include indicators whose `serviceCategoryIds` contains X".
- Replace the pipe-join workaround for the *filter* path with a real set-membership test.

**Open questions.**
- Storage/query shape: keep the joined string and match with a contains/`ANY` test, or carry `serviceCategoryIds` as a proper array/lookup into the query layer.
- Filter UX: multi-select chips on the viz; single vs OR-of-many membership.
- Whether `hfa_service_category` stays in `ALL_DISAGGREGATION_OPTIONS` (as disagg) or is reclassified filter-only.
- Cache-key implications (filter participates in the fetch config hash).

**Key files.** [SYSTEM_09_viz_query_cache.md](SYSTEM_09_viz_query_cache.md), `server/server_only_funcs_presentation_objects/cte_manager.ts`, `get_combined_query.ts`, `query_helpers.ts`, `get_possible_values.ts`, [lib/types/disaggregation_options.ts](lib/types/disaggregation_options.ts), filter UI in `client/`.

---

## 5. Carry-forward fallback (USE_PREVIOUS / USE_NEXT)  ·  effort L  ·  app + wb-fastr-modules  ·  ⬜ REMAINING

**Problem.** When a facility has no value for an indicator in a round, optionally **carry the same facility's value from the previous (or next) round** — at the **facility level**, as a **fallback**: keep the real `r_code`, fall back only when it yields missing (NA).

**Decisions settled.**
- Semantics: **fallback, not replacement** — real code runs first; carry only fills the NA. Lookup is per **facility × indicator × round**.
- Must run **inside the R module** (only place facility granularity exists, before weighting).

**Design fork (recommendation: dedicated field, not a sentinel-in-`r_code`).**
- The fallback property *requires keeping the real `r_code`*, so a replacement sentinel (`r_code = USE_PREV`) can't express "compute, then fall back". A **separate per-round fallback policy** (`none | prev | next`) alongside `r_code__Round N` keeps "how to compute" and "what if missing" cleanly separated, validates without overloading the r_code parser, and shows as its own editor column.
- Grain mirrors existing `r_code__Round N` / `r_filter_code__Round N`.

**Open questions.**
- Confirm which module consumes the HFA workbook params (anchor: [get_script_with_parameters_hfa.ts](server/server_only_funcs/get_script_with_parameters_hfa.ts)). Note `m004`/`m005`/`m006` already do **admin-area × year** `zoo::na.locf` carry-forward for projections — *different mechanism*; don't conflate.
- Chained gaps (round 3 missing → 2 also missing → fall to 1?) and prev/next conflict resolution.
- Whole-round-absent vs present-but-NA — both should be covered.
- **Interaction with sentinel handling** ([PLAN_HFA_SENTINEL_VALUES.md](PLAN_HFA_SENTINEL_VALUES.md)): "yields missing (NA)" now depends on the `DONT_KNOW_TREATMENT` policy — a DK-as-No item resolves to 0/No, not NA, so it would *not* trigger carry-forward. Define fallback against the post-policy value.

**Touches (cross-repo, in lockstep).** Workbook schema + parser, `hfa_indicators` schema/types/Zod, project snapshot tables ([datasets_in_project_hfa.ts](server/db/project/datasets_in_project_hfa.ts)), param injection, the **R script** in `wb-fastr-modules` (+ regenerated `definition.json`), editor UI, validation/status.

---

## 6. HFA Indicator AI Assistant  ·  effort M–L  ·  app only  ·  ✅ FIRST PASS SHIPPED (hardening remaining)

**Problem.** Authoring/maintaining the ~271-indicator dictionary by hand — filling short labels, cleaning long labels, categorizing, fixing validation errors, and ultimately generating net-new indicators from raw survey variables — is painful. This was originally planned as three tiers (A: labels/categories, B: validation-repair + r_code edits, C: generate new indicators). **The first pass built all three at once**, so the tiers are collapsed here.

**Shipped (commit `84b1d060`, 2026-06-25, deployed to `hfa-ai-testing`).** Lives in [client/src/components/indicator_manager_hfa/ai/](client/src/components/indicator_manager_hfa/ai/), mounted as `HfaIndicatorAiWrapper` in `hfa_indicators_manager.tsx`, gated to global admins.
- **Self-contained, matching the stated design.** Own SDK client, own instance proxy route (`server/routes/instance/ai_proxy.ts`, mounted `/ai-instance`, guarded by `can_configure_data`), own tool set, own system prompt, own conversation scope. Reuses only panther's chat engine + the Anthropic proxy pattern — clean separation from `project_ai`. Key stays server-side (browser SDK points `baseURL` at the proxy). Model `claude-sonnet-4-6`, `max_tokens: 4096`.
- **Tool set spans all three tiers** (`ai/tools.ts`):
  - Read: `get_hfa_indicators` (incl. a `missingShortLabel` filter to *find* empties), `get_hfa_taxonomy`, `get_hfa_variable_dictionary`, `inspect_hfa_variable`, `get_hfa_indicator_code`.
  - Tier A writes: `update_hfa_indicator_labels`, `assign_hfa_indicator_categories` (→ `updateHfaIndicatorsBulk`).
  - Tier B: `validate_hfa_indicators` (→ `bulkUpdateHfaIndicatorValidation`), `set_hfa_indicator_code` (→ `saveHfaIndicatorFull`, recomputes validation).
  - Tier C: `create_hfa_indicators` (→ `batchUploadHfaIndicators`), plus `delete_hfa_indicators`.
- **Human gate exists.** Every write routes through a confirm dialog before touching the DB (`confirmGate`, serialised via `confirmChain` so parallel tool calls don't clobber the single dialog); cancel returns `{applied:false}`. Client-side validation (ids, sub-cat parentage, time points, dup varNames) runs before the confirm; server writes are transactional.
- **Validation loop is real.** `validate` / `set_code` / `create` return structured per-indicator issues to the model, which re-reads fresh state each call and can iterate within a turn.
- **Cost governance.** Proxy does usage logging + daily/weekly token limits; streaming supported.

**Remaining (hardening, not rebuild).**
- **Review UX is a text confirm, not a visual diff.** Writes render as plain-text summary lines (`varName · short: "old" → "new"`) in a confirm dialog. The system prompt (`ai/system_prompt.ts:46`) tells the user changes are shown "with a diff" — **contract drift**: either build the visual diff/accept preview the plan envisioned, or fix the prompt to match. This is the top gap vs. the original design.
- **Taxonomy editing is out of scope** — the assistant can *assign* categories but can't create/rename them (`system_prompt.ts:41`). Decide whether that stays manual.
- **No per-conversation cost cap** (only shared instance/user token limits); `max_tokens` hardcoded.
- `inspect_hfa_variable` loads the entire dataset display info then filters client-side — fine now, unbounded at scale.
- No tests, no telemetry on tool acceptance/rejection rate.
- Still labelled/deployed as `hfa-ai-testing` — confirm the graduation-to-production path.

**Key files.** [client/src/components/indicator_manager_hfa/ai/](client/src/components/indicator_manager_hfa/ai/) (`index.tsx`, `chat_pane.tsx`, `sdk_client.ts`, `system_prompt.ts`, `tools.ts`), [server/routes/instance/ai_proxy.ts](server/routes/instance/ai_proxy.ts), [server/db/instance/hfa_indicators.ts](server/db/instance/hfa_indicators.ts), [DOC_AI_PROXY_AND_USAGE_GOVERNANCE.md](DOC_AI_PROXY_AND_USAGE_GOVERNANCE.md).

---

## Parked (not in active scope)

- **Upload bugs** (admin areas / facilities / weights). The 2026-07-02 S6 review resolved or triaged the old import-doc warnings (escaping is uniform now; claims are race-free conditional UPDATEs); the remaining latent issues are [SYSTEM_06_ingestion.md](SYSTEM_06_ingestion.md) "Open items". Revisit once specific reproductions are in hand.
- **"Other" coding with AI** — future/exploratory; revisit after the AI assistant's indicator-authoring loop proves out on real data.

---

## Suggested sequencing

Items 1–2 shipped as one label-resolution layer; the AI assistant (6) shipped as a cross-cutting first pass. Remaining feature work — 3 (row removal), 4 (service-category filter), 5 (carry-forward) — is mutually independent and can slot in any order; 5 is the heaviest (only cross-repo item, and now interacts with sentinel policy). The AI assistant's top remaining item is the visual-diff review UX (or fixing the prompt's over-promise).
