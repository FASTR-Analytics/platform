# PLAN_1c — Module cleanup (m003 becomes the indicators module; disruptions → m011)

Status: DIRECTION RULED 2026-08-30 (Tim); final design is written AFTER
[PLAN_1a](PLAN_1a_INDICATOR_RESTRUCTURE.md) +
[PLAN_1b](PLAN_1b_POPULATION_STORE.md) ship and settle. This file records
the ruled end state and the known mechanics so the interim m012 state never
reads as permanent.

Repos: app = `/Users/timroberton/projects/apps/wb-fastr`; modules =
`/Users/timroberton/projects/apps/wb-fastr-modules`.

## Ruled end state

The HMIS chain is three modules by intent: **m001** (data quality) →
**m002** (adjustment) → **m003** (indicators — reports every dictionary
indicator off the adjusted counts). Disruptions is its own concern and
lives in **m011** at all grains. Each dataset family then has one
first-class indicator surface (HMIS: the new m003 file; HFA: M10; ICEH:
M9) — the symmetry the future "Explore indicators" page and any
cross-family combination build on (both OUT of scope here).

## Work items

1. **m003 redefined = m012 absorbed.** The `indicator_values` RO and
   metric(s) move under the m003 id; m012 is deleted from the registry.
   The m12-\* → m3-\* vocabulary change happens ONCE, here:
   - project migration UPDATEs `presentation_objects.metric_id` by
     EXPLICIT literal id pairs (never a pattern sweep — the `4f0dd3dc`
     lesson);
   - frozen FigureBundles are self-contained and untouched;
   - MCP/fleet tooling vocabulary follows new packages (playbook mentions
     of the ids updated at the same time);
   - old m012-bearing packages are frozen-plane: they keep rendering
     because manifest reads are registry-free (1a §1.9's read-path
     change).
2. **Volumes continuity.** Decide m3-01-01's fate against 1a's
   adjustment-basis ruling: keep the id and the `count_final_*` column
   names over the indicators file (stored volume charts keep working
   across repoint), or retire it into the indicator-values metric.
   Decide at design time here, not by drift.
3. **Disruptions out of m003.** m011 gains admin-area-3 and -4 results
   objects + metrics (modules repo; same shapes as its existing
   national/aa2 pair). Then delete from m003: the four
   `M3_disruptions_analysis_admin_area_*` ROs and their nine metrics, and
   `M3_service_utilization.csv` (a verbatim copy of `M2_adjusted_data.csv`
   whose only consumer was the old m3-01-01). PO disposition for the
   deleted disruption metrics: explicit-literal-id migration, either
   deleting or repointing to the m011 equivalents — ruled when this plan
   is finalized.
4. **m007/m008 directories** in wb-fastr-modules deleted here if still
   present and confirmed unneeded.
5. Docs: SYSTEM_08 module inventory, SYSTEM_05 pointers, MCP playbook id
   references; lint:systems.

## Verification

`deno task typecheck`; `./validate_migrations`; the 1a generation + items
harnesses re-run against a package generated with the redefined m003;
frozen-plane harness: a manifest containing m012 (and m007/m008) still
renders module summaries.
