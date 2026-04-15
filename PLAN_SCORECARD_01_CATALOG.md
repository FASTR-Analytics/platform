# PLAN: Scorecard Phase 1 — Catalog Data Model & UI

Introduce the `scorecard_indicator` table as an instance-level entity, build the CRUD UI as a new tab in the indicators manager, and seed the 10 current m007 indicators with dummy threshold values. Pure additive work: no module changes, no viz changes, no project-side changes. m007 is untouched.

At the end of this phase the app has an editable instance-level catalog of scorecard indicators. Nothing consumes the catalog yet — phase 2 wires it into the project dataset pipeline and m008.

## 1.1 — Data model

**Two files to update together.** The codebase keeps schema in two places:

1. **Canonical schema:** [`server/db/instance/_main_database.sql`](server/db/instance/_main_database.sql) — used by fresh installs. Contains the latest shape of every instance table.
2. **Migrations:** `server/db/migrations/instance/NNN_*.sql` — used by existing installs to catch up. Auto-run at startup via [`db_startup.ts`](server/db/startup/db_startup.ts).

Both must stay in sync. Add the `CREATE TABLE` to `_main_database.sql` alongside the existing `hfa_indicators` definition (around line 342), and ship a migration as `server/db/migrations/instance/019_add_scorecard_indicators.sql`. Next free number (current max is `018_add_hfa_indicator_aggregation.sql`).

**One migration file, not two.** The table definition and the seed rows live together:

```sql
CREATE TABLE IF NOT EXISTS scorecard_indicators (
  scorecard_indicator_id     TEXT PRIMARY KEY NOT NULL,
  label                      TEXT NOT NULL UNIQUE,
  group_label                TEXT NOT NULL DEFAULT '',
  sort_order                 INTEGER NOT NULL DEFAULT 0,

  -- Computation (structural — see D3 in the overview).
  -- `denom_population_fraction` is the ANNUAL fraction of population relevant
  -- to the indicator (e.g. 0.04 births, 0.22 women 15-49, 1.0 whole pop).
  -- The consuming module applies its own period scaling — see phase 2 §2.9.
  num_indicator_id           TEXT NOT NULL,
  denom_kind                 TEXT NOT NULL
                             CHECK (denom_kind IN ('indicator', 'population')),
  denom_indicator_id         TEXT,
  denom_population_fraction  REAL,

  -- Formatting (read in phase 3; seeded here with sensible defaults)
  format_as                  TEXT NOT NULL DEFAULT 'percent'
                             CHECK (format_as IN ('percent', 'number', 'rate_per_10k')),
  decimal_places             INTEGER NOT NULL DEFAULT 0,

  -- Thresholds (per-row cutoff numbers — see D7 in the overview)
  threshold_direction        TEXT NOT NULL DEFAULT 'higher_is_better'
                             CHECK (threshold_direction IN ('higher_is_better', 'lower_is_better')),
  threshold_green            REAL NOT NULL,
  threshold_yellow           REAL NOT NULL,

  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CHECK (
    (denom_kind = 'indicator'
       AND denom_indicator_id IS NOT NULL
       AND denom_population_fraction IS NULL)
    OR
    (denom_kind = 'population'
       AND denom_indicator_id IS NULL
       AND denom_population_fraction IS NOT NULL)
  )
);
```

**Two constraints worth calling out:**

- `label UNIQUE`. Phase 3 does a label-based lookup in the scorecard style closure (see overview D8). If two rows share a label, the lookup is ambiguous. Enforce uniqueness at the DB level; the editor surfaces a clear error.
- Discriminated `denom_kind` with a compound CHECK. Either `denom_indicator_id` is set (and the two population fields are NULL), or the two population fields are set (and `denom_indicator_id` is NULL). Invalid shapes are rejected by the DB, not just by the editor.

**Soft references, not SQL foreign keys.** `num_indicator_id` and `denom_indicator_id` refer to `indicators.indicator_common_id` but without a FK. If a common indicator is renamed or deleted, the scorecard row survives and the editor flags it with a broken-reference badge. Cascade-deletion is too destructive for an indirect, optional coupling.

**Style matches existing HFA indicators table** at [011_add_hfa_indicators_table.sql](server/db/migrations/instance/011_add_hfa_indicators_table.sql): `IF NOT EXISTS`, `TEXT PRIMARY KEY`, inline `CHECK` constraints, `TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`.

**Idempotency.** `CREATE TABLE IF NOT EXISTS` + `INSERT ... ON CONFLICT (scorecard_indicator_id) DO NOTHING` for the seed rows (see §1.9). The migration is safe to re-run after dev DB resets or migration-tracker drift — matches the convention the rest of the codebase uses.

## 1.2 — Shared type

Add to [lib/types/indicators.ts](lib/types/indicators.ts) alongside the existing indicator types.

```ts
export type ScorecardIndicator = {
  scorecard_indicator_id: string;
  label: string;
  group_label: string;
  sort_order: number;

  num_indicator_id: string;
  denom:
    | { kind: "indicator"; indicator_id: string }
    | { kind: "population"; population_fraction: number };

  format_as: "percent" | "number" | "rate_per_10k";
  decimal_places: number;

  threshold_direction: "higher_is_better" | "lower_is_better";
  threshold_green: number;
  threshold_yellow: number;
};
```

The DB columns are flat (nullable); the TS type uses a discriminated union so callers can't mix fields from both branches. The data-access layer does the shape conversion via a `dbRowToScorecardIndicator` helper (pattern from [server/db/instance/hfa_indicators.ts](server/db/instance/hfa_indicators.ts)).

## 1.3 — DB access layer

New file: `server/db/instance/scorecard_indicators.ts`. Mirrors the common-indicator access layer at [server/db/instance/indicators.ts](server/db/instance/indicators.ts) and the HFA access layer at [server/db/instance/hfa_indicators.ts](server/db/instance/hfa_indicators.ts).

Exports:

```ts
export function dbRowToScorecardIndicator(row: DBRow): ScorecardIndicator
export async function getScorecardIndicators(mainDb: Sql): Promise<APIResponseWithData<ScorecardIndicator[]>>
export async function createScorecardIndicator(mainDb: Sql, indicator: ScorecardIndicator): Promise<APIResponseNoData>
export async function updateScorecardIndicator(mainDb: Sql, oldId: string, indicator: ScorecardIndicator): Promise<APIResponseNoData>
export async function deleteScorecardIndicators(mainDb: Sql, ids: string[]): Promise<APIResponseNoData>
export async function getScorecardIndicatorsVersion(mainDb: Sql): Promise<string>
```

All wrapped in `tryCatchDatabaseAsync`, returning `APIResponseWithData` / `APIResponseNoData`. Template-literal `postgres.js` queries. Transactions via `mainDb.begin()` where needed.

`getScorecardIndicatorsVersion` returns an MD5 hash of `MAX(updated_at) + COUNT(*)`, mirroring [getIndicatorMappingsVersion](server/db/instance/instance.ts) and [getHfaIndicatorsVersion](server/db/instance/instance.ts). Used by the client cache-busting mechanism in §1.6 and by the phase-2 project snapshot.

Export from `server/db/mod.ts` alongside the existing access-layer exports.

## 1.4 — CRUD API routes

New file: `server/routes/instance/scorecard_indicators.ts`. Mirrors [server/routes/instance/indicators.ts](server/routes/instance/indicators.ts). **All POST verbs** to match the codebase convention — no PUT or DELETE.

```ts
export const routesScorecardIndicators = new Hono();

defineRoute(
  routesScorecardIndicators,
  "getScorecardIndicators",
  requireGlobalPermission("can_configure_data"),
  log("getScorecardIndicators"),
  async (c) => c.json(await getScorecardIndicators(c.var.mainDb)),
);

defineRoute(
  routesScorecardIndicators,
  "createScorecardIndicator",
  requireGlobalPermission("can_configure_data"),
  log("createScorecardIndicator"),
  async (c, { body }) => {
    // validate body.indicator shape; reject on missing required fields
    const res = await createScorecardIndicator(c.var.mainDb, body.indicator);
    if (res.success) {
      notifyInstanceScorecardIndicatorsUpdated(
        await getInstanceScorecardIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

// updateScorecardIndicator, deleteScorecardIndicators: same shape
```

**Routes:**

- `GET  /scorecard_indicators`
- `POST /scorecard_indicators`
- `POST /scorecard_indicators/update` (body includes `old_scorecard_indicator_id` + `indicator`)
- `POST /scorecard_indicators/delete` (body includes `scorecard_indicator_ids: string[]`)

**No delete guard.** Scorecard indicator deletion is unconditional. Presentation objects that filter on a deleted ID degrade gracefully (empty cells, no-data messages) — same as every other reference in the system.

**Permission gate:** `requireGlobalPermission("can_configure_data")`, same as common indicators and HFA indicators.

**Route registry:** new file `lib/api-routes/instance/scorecard_indicators.ts` exports `scorecardIndicatorRouteRegistry`, mirroring [lib/api-routes/instance/indicators.ts](lib/api-routes/instance/indicators.ts). Wire up in `main.ts` alongside the other instance route groups.

## 1.5 — SSE invalidation

Add a new SSE event type to `lib/types/instance_sse.ts`:

```ts
| { type: "scorecard_indicators_updated"; data: InstanceScorecardIndicatorsSummary }

export type InstanceScorecardIndicatorsSummary = {
  count: number;
  version: string;
};
```

Add to [server/task_management/notify_instance_updated.ts](server/task_management/notify_instance_updated.ts):

```ts
export function notifyInstanceScorecardIndicatorsUpdated(
  data: InstanceScorecardIndicatorsSummary,
) {
  notifyInstanceUpdate({ type: "scorecard_indicators_updated", data });
}
```

Add `getInstanceScorecardIndicatorsSummary(mainDb)` helper alongside the existing summary functions.

**Client state:** add `scorecardIndicatorsVersion: string` to the instance store at [client/src/state/instance/t1_store.ts](client/src/state/instance/t1_store.ts). Wire the SSE message handler to update it via a new `updateInstanceScorecardIndicators` function (mirrors `updateInstanceIndicators`).

## 1.6 — Client cache + fetch

Add a reactive cache to [client/src/state/instance/t2_indicators.ts](client/src/state/instance/t2_indicators.ts) alongside the existing common-indicators and HFA-indicators caches:

```ts
const _SCORECARD_INDICATORS_CACHE = createReactiveCache<
  { scorecardIndicatorsVersion: string },
  ScorecardIndicator[]
>({
  name: "instance_scorecard_indicators",
  uniquenessKeys: () => ["scorecard_indicators"],
  versionKey: (params) => params.scorecardIndicatorsVersion,
  pdsNotRequired: true,
});

export async function getScorecardIndicatorsFromCacheOrFetch(
  scorecardIndicatorsVersion: string,
) {
  const { data, version } = await _SCORECARD_INDICATORS_CACHE.get({
    scorecardIndicatorsVersion,
  });
  if (data) return { success: true, data } as const;

  const promise = serverActions.getScorecardIndicators({});
  _SCORECARD_INDICATORS_CACHE.setPromise(
    promise,
    { scorecardIndicatorsVersion },
    version,
  );
  return await promise;
}
```

Version-key invalidation means SSE events automatically refresh the cache without explicit invalidation calls. Used by phase 3's style closure (see [PLAN_SCORECARD_03_FORMATTING.md §3.1](PLAN_SCORECARD_03_FORMATTING.md)).

## 1.7 — Indicators manager: three-tab refactor

**File:** [client/src/components/indicators/indicators_manager.tsx](client/src/components/indicators/indicators_manager.tsx)

Today this component renders `CommonIndicatorsTable` and `RawIndicatorsTable` side-by-side (inline components within the same file, wrapping two fetches and one `StateHolderWrapper`). Refactor to a three-tab layout using panther's `getTabs` + `TabsNavigation` from [panther/_303_components/layout/tabs/mod.ts](panther/_303_components/layout/tabs/mod.ts). Working example at [panther/_303_components/layout/tabs/example_visual.tsx](panther/_303_components/layout/tabs/example_visual.tsx).

```tsx
const tabs = getTabs(
  [
    { value: "common",    label: t3({ en: "Common indicators",     fr: "Indicateurs communs" }) },
    { value: "raw",       label: t3({ en: "Raw DHIS2 indicators",  fr: "Indicateurs DHIS2"    }) },
    { value: "scorecard", label: t3({ en: "Scorecard indicators",  fr: "Indicateurs du scorecard" }) },
  ],
  { initialTab: "common" },
);
```

Inside the existing `FrameTop` body, render `<TabsNavigation tabs={tabs} />` in the panel area and switch the main content between the three tables using panther's `Match when={tabs.isTabActive("...")}` pattern.

`CommonIndicatorsTable` and `RawIndicatorsTable` keep their internal behaviour untouched — they just move from side-by-side panels into the tab panels for `"common"` and `"raw"` respectively. **Do not** invent a custom tab implementation.

**Scorecard tab** renders a new `ScorecardIndicatorsTable` component (next section). It fetches via `getScorecardIndicatorsFromCacheOrFetch(instanceState.scorecardIndicatorsVersion)` inside its own `createEffect`, independent of the common/raw fetch.

## 1.8 — Scorecard indicators table + editor

Two new components:

### `client/src/components/indicators/scorecard_indicators_table.tsx`

List view. Rendered via panther `Table` + `TableColumn<ScorecardIndicator>`. Grouped by `group_label` (use `Table`'s row-group support or a simple `<For each={groupedRows}>` if grouping is cosmetic). Row actions: edit, duplicate, delete (via `timActionDelete` — unconditional, no guard), reorder within group. Bulk delete via `BulkAction<ScorecardIndicator>`.

Columns:

| Column | Content |
| --- | --- |
| Label | text |
| Group | text |
| Numerator | `num_indicator_id`, monospace |
| Denominator | if `denom.kind === "indicator"`: `denom.indicator_id` (monospace); else: `pop × {population_fraction}` |
| Format | `format_as` |
| Thresholds | `{direction} · {green}/{yellow}` |
| Actions | pencil + trash, admin-only |

**Broken-reference badge.** On load, resolve `num_indicator_id` and (when applicable) `denom.indicator_id` against the common-indicators list. Rows with unresolved references render a red badge; save is still allowed (soft references) but the admin sees the warning.

### `client/src/components/indicators/scorecard_indicator_editor.tsx`

Add/edit form opened via `openComponent({ element: ScorecardIndicatorEditorForm })` from the list (same pattern as [client/src/components/indicators/_edit_indicator_common.tsx](client/src/components/indicators/_edit_indicator_common.tsx)).

Editor fields:

| Field | Control |
| --- | --- |
| Scorecard indicator ID | text (disabled on edit) |
| Label | text — live-validated for uniqueness across the catalog |
| Group | combobox (existing `group_label` values + "new group" option) |
| Sort order | number |
| Numerator indicator | searchable dropdown of common indicators |
| Denominator kind | radio: "Another indicator" / "Population-based" |
| Denominator indicator | dropdown, shown when kind = indicator |
| Population fraction | number 0–1, shown when kind = population, helper *"annual fraction of the population relevant to this indicator (0.04 for children under 1, 0.22 for women 15–49, 1.0 for the whole population). The module applies its own period scaling."* |
| Format | select: Percent / Number / Rate per 10,000 |
| Decimal places | number 0–3 |
| Threshold direction | radio: "Higher is better" / "Lower is better" |
| Green cutoff | number, in the **displayed scale** for the chosen format (e.g. 80 for percent meaning "80%"; 10 for rate_per_10k meaning "10 per 10k") |
| Yellow cutoff | number, in the same display scale |

**Save gating.** Disabled until:

- All required fields are filled.
- Label is unique across the catalog (check against fetched catalog; backend enforces too).
- Numerator indicator resolves to an existing common indicator.
- When kind = indicator: denominator indicator resolves.
- When kind = population: `population_fraction` is a positive number ≤ 1.
- Threshold cutoffs are numbers (no constraint on magnitude — direction handles interpretation).

**Live preview.** One-row sample showing what the formatted output will look like: a synthetic value of 0.73 rendered as `73%`, `0.73`, or `7,300 per 10k` based on format. For thresholds, a three-swatch preview showing green / yellow / red for three example values (min, middle, max of green / yellow / red bucket). Catches "I picked rate_per_10k but meant percent" and "my cutoffs are on the wrong scale" mistakes before saving.

**Duplicate.** Duplicates a row with a new `scorecard_indicator_id` (default: source ID + `_copy`) and a new label (default: source label suffixed with " (copy)"). User edits and saves.

## 1.9 — Seed the 10 current indicators

Seed rows are **appended to the same migration** from §1.1 (`019_add_scorecard_indicators.sql`), not a separate file. One migration creates the table and inserts the seed in one atomic step. Each row uses `INSERT ... ON CONFLICT (scorecard_indicator_id) DO NOTHING` so the migration stays idempotent — re-running is a no-op, and an admin-edited row is never clobbered by a replay.

Labels are copied verbatim from [m007 definition.json valueLabelReplacements](../wb-fastr-modules/m007/definition.json) — they're unique and already human-readable. Group labels are invented (there's no authoritative source; `conditional_formatting_scorecard.ts` has unrelated aspirational groupings). **Threshold cutoffs are dummies** — the admin will set real values later via the editor UI.

**Cutoff scale.** Per [PLAN_SCORECARD_03_FORMATTING.md §3.2](PLAN_SCORECARD_03_FORMATTING.md), threshold cutoffs are stored in the **displayed scale** for each indicator's `format_as`. For percent indicators that means 0–100 (not 0–1); for `rate_per_10k` it means the per-10k scale directly. The style closure scales raw values to match before comparing.

| id | label | group | num | denom | format | thresh dir / green / yellow |
| --- | --- | --- | --- | --- | --- | --- |
| `anc4_anc1_before20_ratio` | ANC4 / ANC1 <20wks | Maternal & Newborn Health | `anc4` | indicator: `anc1_before20` | percent | higher / 80 / 70 |
| `anc4_anc1_ratio` | ANC4 / ANC1 | Maternal & Newborn Health | `anc4` | indicator: `anc1` | percent | higher / 80 / 70 |
| `skilled_birth_attendance` | Skilled Birth Attendant / Reported Deliveries | Maternal & Newborn Health | `sba` | indicator: `delivery` | percent | higher / 80 / 70 |
| `new_fp_acceptors_rate` | New FP Acceptors / Women of Reproductive Age | Reproductive Health | `new_fp` | pop: 0.22 | percent | higher / 80 / 70 |
| `act_malaria_treatment` | ACT for Uncomplicated Malaria | Child Health | `mal_treatment` | indicator: `mal_confirmed_uncomplicated` | percent | higher / 80 / 70 |
| `penta3_coverage` | Penta 3 | Immunization | `penta3` | pop: 0.04 | percent | higher / 80 / 70 |
| `fully_immunized_coverage` | Fully Immunized | Immunization | `fully_immunized` | pop: 0.04 | percent | higher / 80 / 70 |
| `htn_new_per_10000` | HTN New per 10,000 person-years | Non-Communicable Diseases | `hypertension_new` | pop: 1.0 | rate_per_10k | lower / 10 / 20 |
| `diabetes_new_per_10000` | Diabetes New per 10,000 person-years | Non-Communicable Diseases | `diabetes_new` | pop: 1.0 | rate_per_10k | lower / 10 / 20 |
| `nhmis_data_timeliness_final` | NHMIS reports on time with content | HMIS Reporting | `nhmis_timely_and_data` | indicator: `nhmis_expected_reports` | percent | higher / 90 / 80 |

Dummy threshold values are chosen to be *plausible* so that freshly-installed instances render with reasonable colours out of the box, but they are **not** domain-authoritative — admins are expected to set real cutoffs via the editor in due course.

Note on HTN and diabetes: the stored `denom_population_fraction` is `1.0` (whole population). m008's R script multiplies by its module-level `PERIOD_FRACTION = 0.25` (quarterly) at run time — see phase 2 §2.9. The `× 10000` scaling that m007 bakes into the numerator moves into the format layer as `rate_per_10k` — see overview D6.

## Definition of done

- [ ] Single migration `019_add_scorecard_indicators.sql` (table + seed in one file, idempotent via `IF NOT EXISTS` and `ON CONFLICT DO NOTHING`) merged and auto-run on startup
- [ ] `server/db/instance/_main_database.sql` updated in lockstep with the migration (fresh-install path mirrors the migrated state)
- [ ] `ScorecardIndicator` type exists in `lib/types/indicators.ts` as a discriminated union
- [ ] DB access layer (`server/db/instance/scorecard_indicators.ts`) exposes get / create / update / delete / version functions
- [ ] CRUD routes registered in `route-tracker.ts` (via the new `scorecardIndicatorRouteRegistry`) and gated by `can_configure_data`
- [ ] All verbs are POST (no PUT or DELETE)
- [ ] No delete guard — unconditional delete
- [ ] Label uniqueness enforced at DB level (`UNIQUE` constraint) and editor level (live validation)
- [ ] New `scorecard_indicators_updated` SSE event type; `notifyInstanceScorecardIndicatorsUpdated` called after every mutation; `instanceState.scorecardIndicatorsVersion` updated on receipt
- [ ] `getScorecardIndicatorsFromCacheOrFetch` exists and version-invalidates on SSE
- [ ] Indicators manager is a three-tab layout using panther `getTabs` / `TabsNavigation`; common and raw tabs unchanged internally
- [ ] Scorecard tab supports add / edit / duplicate / delete / reorder with live preview, broken-reference badges, and label-uniqueness enforcement
- [ ] Seed contains the 10 m007 indicators with dummy threshold cutoffs; labels match m007's `valueLabelReplacements` verbatim
- [ ] Diff against main shows zero edits to m007, zero edits to the viz layer, zero edits to module-side code
- [ ] `deno task typecheck` clean
