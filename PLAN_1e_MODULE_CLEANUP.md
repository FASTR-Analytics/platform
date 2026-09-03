# PLAN_1e — Module cleanup (m003 becomes the indicators module; disruptions → m011)

Status: DIRECTION RULED 2026-08-30 (Tim); facts corrected same day after
the code-verified review round. Renumbered from 1c on 2026-09-02 when
[PLAN_1c](PLAN_1c_POPULATION_IN_EXPRESSIONS.md) was inserted ahead of it,
and from 1d on 2026-09-03 when
[PLAN_1d](PLAN_1d_INDICATOR_THRESHOLDS_AS_CF_SOURCE.md) was pulled ahead
of it into the 1a+1b+1c release. Final design is written AFTER
[PLAN_1a](PLAN_1a_INDICATOR_RESTRUCTURE.md) +
[PLAN_1b](PLAN_1b_POPULATION_STORE.md) +
[PLAN_1c](PLAN_1c_POPULATION_IN_EXPRESSIONS.md) +
[PLAN_1d](PLAN_1d_INDICATOR_THRESHOLDS_AS_CF_SOURCE.md) ship. **Concrete trigger**: the
first production project repoints to an m012-bearing package AND its
migrated indicators verify against the old m008 values (1b's
validation-target list). When that happens, writing this plan's final
design is the next piece of module work, ahead of any new module feature.
This file records the ruled end state so the interim m012 state never
reads as permanent.

Repos: app = `/Users/timroberton/projects/apps/wb-fastr`; modules =
`/Users/timroberton/projects/apps/wb-fastr-modules`.

## Ruled end state

The HMIS chain is three modules by intent: **m001** (data quality) →
**m002** (adjustment) → **m003** (indicators — every dictionary indicator
off the adjusted counts). Disruptions is its own concern and lives in
**m011** at all grains. Each dataset family then has one first-class
indicator surface (HMIS: the new m003 file; HFA: M10; ICEH: M9) — the
symmetry a future "Explore indicators" page and any cross-family
combination build on (both OUT of scope here).

## Work items

1. **m003 redefined = m012 absorbed.** The `indicator_values` RO and
   metric move under the m003 id; m012 is deleted from the registry. The
   m12-\* → m3-\* vocabulary change happens ONCE, here: a project
   migration UPDATEs `presentation_objects.metric_id` by EXPLICIT literal
   id pairs (never a pattern sweep — `4f0dd3dc`); frozen FigureBundles
   are self-contained and untouched; no `special_chart_checks.ts` list
   names an m12 id once PLAN_1d deletes `SPECIAL_SCORECARD_TABLE_METRICS`
   (verify with a grep at final design); MCP/playbook id mentions update
   in the same change. Old
   m012-bearing packages keep rendering — reading is registry-free after
   1a.
2. **Volumes continuity.** m3-01-01 stays the volumes metric, untouched,
   over its own file — the indicator-values file is area-grain and
   single-basis, so it is NOT a substitute for facility-grain,
   four-basis volume comparison. Whether m003 keeps
   `M3_service_utilization.csv` for it or the metric re-targets
   `M2_adjusted_data` directly (the files are verbatim copies) is decided
   at final design here.
3. **Disruptions out of m003 — metrics-only work in m011** (verified:
   m011 already ships all four `M11_disruptions_analysis_admin_area_1..4`
   ROs and its R script already writes aa3/aa4, with empty-CSV handling
   for absent grains; only aa1/aa2 have metrics). Add the two missing
   m011 metric files (aa3/aa4, same shapes as `m11-01-01/02`), add them
   to `SPECIAL_DISRUPTIONS_CHART_V2_METRICS`, then delete from m003: the
   four `M3_disruptions_analysis_admin_area_*` ROs and their TWELVE
   metrics (`m3-02/03/04/05` × `-01/-02/-03`). Their POs are DELETED by
   explicit-literal-id migration (consistent with the 1a scorecard
   ruling; V1→V2 repointing is rejected — the ROs' column sets differ, so
   repointed configs would be broken). The V1 entries in
   `SPECIAL_DISRUPTIONS_CHART_METRICS` and the m3 disruption ids in
   `ALLOW_NEGATIVE_SCALE_VALUES_METRICS` stay for frozen figures (stored
   vocabulary), with a comment marking them frozen.
4. **m007/m008 module directories** (and m008's `_core.ts`) deleted from
   wb-fastr-modules if still present.
5. Docs: SYSTEM_08 module inventory, SYSTEM_05 pointers, MCP playbook id
   references; lint:systems.

## Verification

`deno task typecheck`; `./validate_migrations`; the 1a generation + items
harnesses re-run against a package generated with the redefined m003;
frozen-plane harness: a manifest containing m012 (and m007/m008) still
renders module summaries and package viewers.
