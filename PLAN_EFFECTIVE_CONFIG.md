# PLAN: One Managed `effectiveConfig` as the Single Source of Truth for Replicant / Disaggregator Effectiveness

> Status: **DRAFT — report only, no implementation yet.** Produced from a verified audit + 3-way design synthesis (8-agent workflow), with the load-bearing facts re-confirmed by hand (see §9). Awaiting Tim's ruling on the §8 open questions before any code is touched.

## Goal

Make a correctly-managed **effective config** the single source of truth for "is this dimension an effective replicant / disaggregator" across **editors, selectors, previews, and rendered visualizations** — solving a recurring class of bug once, not patching one symptom.

## Reported symptoms (three faces of one root cause)

1. Filter a replicant dimension (e.g. "HFA category") to **one** value: the disaggregation panel correctly disables it, but the replicant **list still shows** and the items fetch pins the replicant on top of the subset filter → empty → "No data available."
2. Filter a replicant to a **subset (2+)**: the list still shows **all** values, not the subset.
3. **Inconsistency:** filtering a *different* prop *does* narrow the replicant list, but filtering the replicant column itself does not.

---

## 1. Root cause — the two-class model

There are two kinds of "degenerate disaggregator," and conflating them is why this keeps recurring:

| Class | Trigger | Context needed | Authority |
|---|---|---|---|
| **A — structural** (disaggregator/replicant filtered to exactly one value) | `hasOnlyOneFilteredValue` — reads only `config.d.filterBy` | **none (context-free)** | `getReplicateByProp` (primitive) for the replicant boolean; `getStructurallyEffectivePOConfig` for the full config |
| **B — temporal** (single-period / single-year time disaggregator) | `dateRange.min === max` etc. | `dateRange` | `getEffectivePOConfig(config, {dateRange, valueProps})` |

**Verified invariant:** all three reported symptoms are **Class A**, and a replicant is never a time column. So the entire reported bug class is **context-free** — no `dateRange`, no chicken-and-egg.

The single root cause: [`getReplicateByProp`](lib/get_disaggregator_display_prop.ts#L32) is *documented* to expect an effective config ("single-value disaggregations stripped") but is **purely structural** — it loops `disaggregateBy` for `disDisplayOpt === "replicant"` and never consults `filterBy`. All 18 of its call sites pass **raw** config (plus one raw `disDisplayOpt==="replicant"` scan at `format_metrics_list_for_ai.ts:102` that bypasses the function entirely — §4 #29). So "replicant filtered to one value" is universally treated as an active replicant. The disaggregation panel looks correct only because it independently runs `getEffectivePOConfig` ([panel.tsx:35](client/src/components/visualization/presentation_object_editor_panel.tsx#L35)); the replicant gate ([editor:862](client/src/components/visualization/visualization_editor_inner.tsx#L862)) and the fetch don't — that disagreement *is* symptom 1.

Symptoms 2 & 3 are a **second, independent** root cause: the server's `getPossibleValues` strips the filter on the queried column itself ([:44-46](server/server_only_funcs_presentation_objects/get_possible_values.ts#L44-L46)), so a self-column filter is ignored while other-column filters are honored.

---

## 2. Recommended architecture

Three change-points carry the whole thing (not 21 site edits):

### 2.1 Keystone — make `getReplicateByProp` filter-aware (Class A, context-free)

```ts
export function getReplicateByProp(config): DisaggregationOption | undefined {
  for (const dis of config.d.disaggregateBy) {
    if (dis.disDisplayOpt === "replicant" && !hasOnlyOneFilteredValue(config, dis.disOpt)) {
      return dis.disOpt;
    }
  }
  return undefined;
}
```

`hasOnlyOneFilteredValue` is already exported from `get_fetch_config_from_po.ts:295` and is context-free. This makes **`getReplicateByProp(raw) === getReplicateByProp(effective)`** for the replicant question — *that equality is the "single source of truth" property*, achieved without threading a config object through 18 sites, and it's the only mechanism that reaches the pure-UI gates that never touch the data path. The doc comment (currently fiction) becomes true by construction.

**Decisive call:** do **not** instead keep `getReplicateByProp` a dumb raw scanner and thread `effectiveConfig` everywhere — that requires sourcing context at ~16 sites that don't have it (for a context-free question), is a new bug surface (a caller passing a wrong/absent `dateRange`), and still wouldn't fix the non-data-path gates. **Do NOT** generalize the filter-awareness to the three sibling functions (`getDisaggregatorDisplayProp`, `hasDuplicateDisaggregatorDisplayOptions`, `getNextAvailableDisaggregationDisplayOption`) — their callers already feed them effective config, so adding it would **double-strip**.

### 2.2 Split `getEffectivePOConfig` into two layers (no behavior change)

```ts
// lib/normalize_po_config.ts
// Class A only. Context-free. Safe pre-fetch, server-side, in a JSX memo, with no data.
export function getStructurallyEffectivePOConfig(config): { config; ineffectiveDisaggregators };

// Class A + B. SIGNATURE/RETURN UNCHANGED — calls the structural pass, then layers
// single_period/single_year + effectiveValueProps. No existing caller changes.
export function getEffectivePOConfig(config, context?): EffectivePOConfigResult;
```

`effectiveConfig` is **never stored, never a second store** — it's a pure derivation computed at the moment of use (and, in the editor, a `createMemo` over the raw live `tempConfig`).

### 2.3 Chokepoint — compute the full effective config once, pre-fetch

At the items chokepoint [`t2_presentation_objects.ts:386`](client/src/state/project/t2_presentation_objects.ts#L386), build the fetch config and the yielded-to-render config from
`getEffectivePOConfig(config, {dateRange: getPeriodFilterExactBounds(config.d.periodFilter, resResultsValueInfo.data.periodBounds), valueProps})`.
`periodBounds` is on `resultsValueInfo`, already fetched at `:374`, and `getPeriodFilterExactBounds` is exactly what the editor panel already uses — so this resolves the Class-B context without a second fetch. This kills Class A **and** B for every items consumer (editor, dashboard, slide, report, preview) at one point.

### 2.4 Single source of truth, by surface

| Surface | Source of effectiveness |
|---|---|
| Replicant boolean, everywhere | `getReplicateByProp` (now filter-aware) — identical on raw or effective |
| Items fetch + config yielded to render | `getEffectivePOConfig(..., {dateRange, valueProps})` at the chokepoint |
| Editor panel + gates/guards | `createMemo(getStructurallyEffectivePOConfig(tempConfig))` (Class A) + the panel's existing full `getEffectivePOConfig` (Class B). `tempConfig` stays the raw live store; effectiveness is derived, never stored/mutated |
| Replicant-options list | server keeps the self-column filter (subset ∩); clients send subset via `excludeReplicantFilter:true` (§3) |

---

## 3. The replicant-options list fix (symptoms 2 & 3) — independent of the keystone

One contract, three behaviors:

1. **Filtered to ONE** → `getReplicateByProp` returns `undefined` → list hidden, no options query, the lone value is a plain `filterBy` entry. *(Fixed by the keystone.)*
2. **Filtered to a SUBSET (2+)** → still an effective replicant → options query issued. **Fix: delete the server self-strip** at `get_possible_values.ts:44-46` → `const filteredFilters = filters ?? [];`. The replicant route passes `fetchConfig.filters` (subset present via `excludeReplicantFilter:true`, which drops only the auto-pin — verified: `getFiltersWithoutReplicant` keeps all `filterBy`) → `SELECT DISTINCT col WHERE col IN (subset)`. **Symptom 2 fixed.**
3. **Cross-filter consistency** → all filters now treated uniformly → self-column narrows like any other. **Symptom 3 fixed.**

**⚠ THREE THINGS MUST LAND IN THE SAME COMMIT AS THE STRIP REMOVAL** (all verified against code in the stress-test — the strip removal alone is a silent regression):

1. **Trap A — [`resolve_replicant_structure.ts:41-49`](client/src/components/dashboards/resolve_replicant_structure.ts#L41)** relies on the server self-strip today; it must gain `{excludeReplicantFilter:true}`, or the `"UNSELECTED"` pin reaches the WHERE clause → empty list. *(Post-fix it correctly returns the SUBSET — see §4 #24.)*
2. **Trap B — [`resolve_figure_from_metric.ts:28`](client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts#L28)** builds ONE `fetchConfig` reused for the options query (:40 — pin must be EXCLUDED) AND the items fetch (:74 — pin must be KEPT). **Split it:** a separate `optionsFetchConfig` with `{excludeReplicantFilter:true}` for :40, keep the pinned `fetchConfig` for :74 (mirror `resolveDefaultReplicant`). A naive flag-add corrupts the items fetch (merges all replicant values); doing nothing makes the post-strip options `validValues` always `[selected]` → the AI validation at :45 silently no-ops.
3. **Cache version — bump `PO_CACHE_VERSION "2" → "3"`** ([visualizations.ts:19](server/routes/caches/visualizations.ts#L19)). The options fetch-config already carries the subset `filterBy` (via `excludeReplicantFilter:true`), so `hashFetchConfig` is **identical** before/after and the version hash (`PO_CACHE_VERSION|moduleLastRun|datasetsVersion`) is data-derived — a code-only deploy would **serve the stale full-set payload** and leave symptom 2 broken. This is exactly the `PO_CACHE_VERSION` "meaning changed" contract. (`_PO_ITEMS_CACHE` is unaffected — no self-strip on the items path — but the constant is shared, so items harmlessly re-warm.)

**Cache-sharing invariant:** `resolveDefaultReplicant`, `ReplicateByOptions`, and `resolve_replicant_structure` (post-fix) all build the options fetch-config from the same config + `excludeReplicantFilter:true` → one shared `_REPLICANT_OPTIONS_CACHE` entry, keyed on `hashFetchConfig` (includes `filters`, so subset changes auto-invalidate).

---

## 4. Call-site fix table

`[keystone]` = auto-fixed by the filter-aware `getReplicateByProp`, no site edit. `[edit]` = needs a change. `[leave]` = already correct.

| # | File:line | Change | Mechanism |
|---|---|---|---|
| 1 | `get_disaggregator_display_prop.ts:32` | **[edit]** add `&& !hasOnlyOneFilteredValue(...)`; rewrite doc comment | keystone source |
| 2 | `normalize_po_config.ts:56` | **[edit]** split out `getStructurallyEffectivePOConfig`; `getEffectivePOConfig` calls it (no behavior change) | producer |
| 3 | `get_fetch_config_from_po.ts:424` (`getFiltersWithReplicant`) | **[keystone]** prop→undefined → no pin → **symptom 1 fetch fixed** | keystone |
| 4 | `utils.ts:11` (caption `withReplicant`) | **[keystone]** tokens inert for demoted replicant | keystone |
| 5 | `t2_presentation_objects.ts:386` (chokepoint) | **[edit]** compute effective config w/ pre-fetch dateRange; build fetch + yield from it | Class B chokepoint |
| 6 | `t2_presentation_objects.ts:315` (`resolveDefaultReplicant`) | **[keystone]** short-circuits → no options query, no auto-pick | keystone |
| 7 | `t2_presentation_objects.ts:319-323` (comment) | **[edit]** rewrite — "server strips regardless" is now FALSE | doc |
| 8 | `t2_presentation_objects.ts:133` (override applier) | **[keystone]** | keystone |
| 9 | `visualization_editor_inner.tsx:862` (list gate) | **[keystone]** + pass `structuralConfig()` memo for subset list | keystone+memo |
| 10 | `visualization_editor_inner.tsx:902` (render guard) | **[keystone]** no more spurious "must select a replicant" | keystone |
| 11 | `visualization_editor_inner.tsx:557` (download flag) | **[keystone]** | keystone |
| 12 | `visualization_editor_inner.tsx:867` (`config=` to options) | **[verify — likely no-op]** options derive from `filterBy` via `excludeReplicantFilter:true`; structural stripping only touches `disaggregateBy`. Do NOT thread structural config (keeps all 3 options-callers hashing identically) | — |
| 13 | `visualization_editor_inner.tsx:879` | **[leave]** correct | — |
| 14 | `presentation_object_editor_panel.tsx:35` | **[leave]** gold standard (full ctx) | — |
| 15 | `build_figure_inputs.ts:60` | **[leave]** correct | — |
| 16 | `build_figure_inputs.ts:89-126` (`withReplicant` calls) | **[optional cleanup]** keystone already makes caption tokens inert with RAW config (`withReplicant`→`getReplicateByProp`→undefined); a replicant is never a time column, so raw vs effective is identical here — not load-bearing | — |
| 17 | `resolve_figure_from_visualization.ts:29` | **[keystone]** degenerate ignores `block.replicant` override | keystone |
| 18 | `resolve_figure_from_metric.ts:34` (AI validate) | **[keystone]** no longer throws for filtered-to-one | keystone |
| 19 | `resolve_figure_from_metric.ts:28` (shared fetchConfig — dual use) | **[edit] ⚠ TRAP B (co-equal w/ #24)** — split: options fetchConfig w/ `{excludeReplicantFilter:true}` for :40, keep pinned `fetchConfig` for :74. NOT a flag-add (would merge items). See §3. | options-split |
| 20 | `select_visualization_for_slide.tsx:49` (save gate) | **[keystone]** | keystone |
| 21 | `select_visualization_for_slide.tsx:136` (selector gate) | **[keystone]** + pass structural config to `…Select` | keystone+memo |
| 22 | `dashboard_editor.tsx:466/643/656/735/835` (reconcile gates) | **[keystone]** degenerate → refresh-in-place, not expand | keystone |
| 23 | `resolve_replicant_structure.ts:30` | **[keystone]** degenerate → `null` | keystone |
| 24 | `resolve_replicant_structure.ts:41-49` | **[edit] ⚠ TRAP A** add `{excludeReplicantFilter:true}`; drop redundant `selectedReplicantValue=undefined`. Post-fix returns the **SUBSET** → dashboard expands into exactly the subset panes (desired); update its line-39 "Enumerate the FULL replicant set" comment | options |
| 25 | `server/db/project/presentation_objects.ts:120` (server summary — NOT the route file) | **[keystone]** context-free server-side; `replicateBy` is recomputed on read (not persisted) → fixes instantly | keystone |
| 26 | `get_possible_values.ts:44-46` (self-strip) | **[edit]** `const filteredFilters = filters ?? []` → **symptoms 2 & 3** | Defect B |
| 27 | `ReplicateByOptions.tsx:81/186` (options fetch) | **[verify — likely no change]** already builds options fetch via `excludeReplicantFilter:true` from `filterBy`; structural config wouldn't change the hash | — |
| 28 | `get_fetch_config_from_po.ts:379-409` (`getRollupLabelContext`) | **[leave] ⚠ DO NOT THREAD** — legitimately wants the raw pinned value to name the roll-up row | raw-by-design |
| 29 | `format_metrics_list_for_ai.ts:102` (census gap — found in stress-test) | **[edit]** raw `disDisplayOpt==="replicant"` scan bypasses `getReplicateByProp` → AI prompt advertises "REQUIRES selectedReplicant" while the validator (#18) skips it. Replace with `getReplicateByProp(preset.config)` | keystone-candidate |

---

## 5. Phased implementation plan

**Implementation status (2026-06-17):** the stress-test downgrades hollowed out the scaffolding — `getStructurallyEffectivePOConfig` has **no consumer** (the editor gates are keystone-fixed; the subset list is server-fixed in Phase 4). So **Phase 0 is dropped and Phase 2 is empty.** Real work = **Phase 1 (DONE) + Phase 4**, with Phase 3 the deferrable bonus.

- ~~**Phase 0 — split `getStructurallyEffectivePOConfig`**~~ **DROPPED** — no consumer after the #12/#27 downgrades; the keystone handles the replicant boolean everywhere.
- **Phase 1 — the keystone ✅ DONE (typechecks server+client; browser-verify pending).** `getReplicateByProp` is filter-aware + doc/sibling comments rewritten; `hasOnlyOneFilteredValue` **MOVED** to `get_disaggregator_display_prop.ts` (avoids an import cycle) + re-exported from `get_fetch_config_from_po.ts`; both params **narrowed** to what they read (so `getReplicateByProp` accepts preset configs too — no cast); census-gap site `format_metrics_list_for_ai.ts:102` switched to `getReplicateByProp`. **Browser gate (Tim):** filter a replicant to one value → list hidden, chart renders the single value; an active multi-value replicant still works. **Needs server restart** (summary path runs server-side; no `--watch`).
- ~~**Phase 2 — editor memo wiring**~~ **EMPTY** — #12/#16/#27 all downgraded to no-ops; the keystone already delivers caption inertness.
- **Phase 3 — chokepoint Class-B normalization** (broadest blast radius — isolate). Compute the *effective* config w/ pre-fetch dateRange at the chokepoint **only for the fetch groupBy decision** — the config yielded for render and stored in `bundle.config` must stay **RAW** (selectedReplicantValue-resolved only); `build_figure_inputs` re-derives effective at render. **Do NOT store a Class-B-stripped config** (lossy edit round-trip via `snapshotForVizEditor` — the disaggregator would vanish from the editor on re-open). Guard dateRange with `if (!periodFilter) return undefined` (mirror the panel) so editor and chokepoint agree. Verify no-mutation/copy invariant. Gate: typecheck + exercise editor/dashboard/slide/report/preview once + **re-open a single-period figure in the editor and confirm the disaggregator is still present**. **Server restart.** *Bonus (pre-fetch temporal stripping), not a reported bug — deferrable.*
- **Phase 4 — Defect B server self-strip + options callers** (server change — isolate). **ALL IN ONE COMMIT:** delete the strip; Trap A (`resolve_replicant_structure.ts` `excludeReplicantFilter:true`); Trap B (`resolve_figure_from_metric.ts` options/items split); **bump `PO_CACHE_VERSION "2"→"3"`**; rewrite the #7 comment. Gate: typecheck. **Server restart.** Browser: subset of 2 → list shows exactly those 2 (symptom 2); cross-filter a different column still narrows (symptom 3); an **active multi-value AI replicant figure still pins** (items not merged) and an invalid `selectedReplicant` still throws; the version bump re-warms (no stale full-set served); a subset-filtered replicant **expands to exactly the subset panes** on a dashboard.
- **Phase 5 — docs.** Rewrite `DOC_DISAGGREGATION_OPTIONS_HANDLING.md`: the two-class model, context-free filter-aware `getReplicateByProp`, chokepoint owns Class B, options-list subset contract.

**Ordering rationale:** Phase 1 ships all of symptom 1 at lowest risk. Phase 4 ships symptoms 2/3 independently. Phase 3 is bundled separately (broadest, and a bonus rather than a reported bug).

---

## 6. Risks & migration

1. **No DB migration.** Effectiveness is a pure derivation of stored config; nothing persisted changes shape. A stored config with a replicant-filtered-to-one renders correctly the instant the keystone ships. **Do NOT add a save-time normalize that strips the disaggregator** (the rejected "store effective config" anti-pattern — the FigureBundle storage-drift lesson). The single value already lives in `filterBy`; demotion loses nothing.
2. **Server summary `replicateBy` — NOT a risk** *(earlier risk #2 / Q4 was factually wrong — dropped).* `configToSummary` *recomputes* it from stored config on every read (`server/db/project/presentation_objects.ts:114-128`); it's not persisted. The keystone fixes the badge instantly on next read — zero staleness, no sweep.
3. **⚠ The OPTIONS cache DOES need a prefix bump (Phase 4).** `_REPLICANT_OPTIONS_CACHE` keys on `PO_CACHE_VERSION|moduleLastRun|datasetsVersion` + `hashFetchConfig`; the options fetch-config is unchanged by the code-only Phase-4 change, so the version constant MUST be bumped `"2"→"3"` or the stale full-set payload is served (§3). `_PO_ITEMS_CACHE` isn't exposed (no self-strip on items) but shares the constant and harmlessly re-warms. **No payload-*shape* change → no `slide_config` sweep, no FigureBundle force-block.**
4. **No FigureInputs/FigureBundle shape change** → no force-block needed (items is `z.record`, config re-derived at render).
5. **Dashboard reshape:** reconcile gates flip for a replicant-filtered-to-one (now no-replicant → refresh-in-place, not expand). NOTE today such a viz expands into a **multi-pane group of ALL values** (the server-strip artifact) — that's the Phase-1 browser-check starting state, not a "single-pane group." Behavior change mid-edit for an existing such dashboard — verify the confirm-collapse modal appears and is acceptable.
6. **Phase 4's three same-commit edits** (Trap A, Trap B, `PO_CACHE_VERSION` bump — §3) must land together; the strip removal alone is a silent regression.

---

## 7. What this buys

- All three reported symptoms fixed by **5 real edits + 1 trap-edit + 2 comment rewrites + 1 doc** — most call sites auto-corrected by the keystone.
- The "single source of truth" property is structural (`getReplicateByProp(raw) === getReplicateByProp(effective)`), so the *next* surface that asks "is there a replicant" is correct for free.

---

## 8. Decisions & implementation notes

### Genuine decisions (settled with Tim, 2026-06-17)

1. **Caption token for a demoted replicant → inert.** A replicant filtered to one value leaves the literal `REPLICANT` caption token in place rather than substituting the single value's label. (Simpler, consistent.)
2. **Phase 3 (chokepoint Class-B) → included**, contingent on Tim reviewing this written plan before implementation begins.
3. **✅ RESOLVED (Tim, 2026-06-17) — constrain the replicant dropdown to the in-filter subset.** Removing the server self-strip is confirmed safe. The documented self-strip ([DOC:358](DOC_DISAGGREGATION_OPTIONS_HANDLING.md)) exists for the *filter-value-checkbox* use case (which needs ALL values to pick from), and that path is on a separate no-filter code path → unaffected. The only behavior that changes is the *replicant dropdown* — exactly the reported bug. The old "don't trap the user on an out-of-filter pick" concern is already handled by the shipped reconcile (`c3d1f540`). Proceed.

### Mine to handle during implementation (NOT decisions for Tim)

- **Pre-fetch vs post-fetch dateRange (code-correctness check, not a judgment call).** Phase 3 decides single-period/single-year collapse from a date range. Directionality argument: filters only narrow → pre-fetch strip ⊆ post-fetch strip → fetched items always ⊇ render needs → safe. I'll use pre-fetch dateRange only for the *fetch groupBy* decision and post-fetch `ih.dateRange` for the *render*, with the `if (!periodFilter) return undefined` guard mirroring the panel.
- **Sibling-function warning → add it, with the RIGHT per-function reason.** `getDisaggregatorDisplayProp` and `hasDuplicateDisaggregatorDisplayOptions` are fed effective config by their callers → adding filter-awareness would double-strip. `getNextAvailableDisaggregationDisplayOption` takes RAW config but is filter-agnostic by nature (only picks the next free display slot, never consults replicant/filter) → leave it for a *different* reason. Do NOT write the blanket "callers feed effective config" on the third — it's false there.

---

## 9. Verification stamp (independently confirmed — plan + 9-agent adversarial stress-test, verdict AMEND-then-LOCKED)

Design verified:
- `hasOnlyOneFilteredValue` reads only `config.d.filterBy` → context-free → keystone safe everywhere ✓ ([:295-302](lib/get_fetch_config_from_po.ts#L295)).
- `getFiltersWithReplicant` adds the pin only when `getReplicateByProp` is truthy ✓ ([:424-435](lib/get_fetch_config_from_po.ts#L424)) → keystone removes it automatically.
- `getReplicateByProp` is purely structural today (never reads `filterBy`) ✓; keystone is safe at all sites; the disaggregation panel does NOT depend on it (uses `getEffectivePOConfig`) ✓; `getRollupLabelContext` doesn't route through it ✓.
- `getPossibleValues` has exactly two callers (`get_results_value_info.ts:134` passes no filters → `?? []` no-op; replicant route `presentation_objects.ts:673`) → contained blast radius ✓.
- Server self-strip exists at `get_possible_values.ts:44-46` ✓.

Stress-test blockers (folded into §3/§4/§5/§6):
- **Trap B** — `resolve_figure_from_metric.ts:28` reuses ONE `fetchConfig` for options (:40, pin-excluded) AND items (:74, pin-kept) ✓ — naive flag-add merges items.
- **Cache bump** — `PO_CACHE_VERSION = "2"` ([visualizations.ts:19](server/routes/caches/visualizations.ts#L19)); its own comment is the "meaning changed → bump" contract; options fetch-config hash is unchanged by Phase 4 → must bump ✓.
- **Census gap** — `format_metrics_list_for_ai.ts:102` raw scan ✓.
- **Risk #2 was wrong** — `replicateBy` is recomputed on read, not persisted ✓ (dropped).
