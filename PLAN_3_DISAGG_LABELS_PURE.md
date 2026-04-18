# PLAN 3: Disaggregation Labels — Config as Single Source of Truth

Eliminate baked-in display labels on `ResultsValue.disaggregationOptions`. Labels are config (live in `instanceState.adminAreaLabels` / `instanceState.facilityColumns`) and are computed at render time by a single helper shared between client and server. Facility column labels and admin area labels get unified treatment. The client-side `getDisplayDisaggregationLabel` override in `admin_area_label.ts` — currently a band-aid for admin areas only — goes away, replaced by the canonical helper used uniformly at every display site.

---

## Decisions (no open questions)

| # | Decision |
|---|---|
| D1 | `ResultsValue.disaggregationOptions[]` **loses its `label` field**. New shape: `{ value, isRequired, allowedPresentationOptions? }`. This is a runtime-enrichment type only; it is not stored in the DB or in module_defs, so there is no migration. |
| D2 | **One canonical helper in `lib/`**: `getDisaggregationLabel(disOpt, config)` → `TranslatableString`. Pure function. Takes `{ adminAreaLabels?, facilityColumns? }` as its config argument. Handles admin areas, facility columns (custom + default), time periods, indicators, denominators, hfa, time_point. Replaces the label half of `getDisaggregationMetadata` in the enricher and the admin-area override helper on the client. |
| D3 | **`allowedPresentationOptions` is pure static metadata** (which disOpts are time-based). Move into a separate small helper `getDisaggregationAllowedPresentationOptions(disOpt)` in the same lib file. The enricher uses it to populate the stripped-down `disaggregationOptions` array. |
| D4 | **Client render call shape**: a thin wrapper in `client/src/state/instance/admin_area_label.ts` (renamed to `disaggregation_label.ts`) closes over `instanceState` and calls the lib helper. Every JSX render site calls the wrapper — single call pattern for every disaggregation label anywhere in the client. |
| D5 | **Server render call shape**: `server/db/project/modules.ts::getMetricsListForAI` already fetches `facilityConfig` + `adminAreaLabels` at the top of the function. It calls the lib helper directly with those configs — no wrapper needed server-side. |
| D6 | **No cache invalidation needed.** `_PO_DETAIL_CACHE` in `visualizations.ts` stores enriched metrics; once `label` is gone from the enriched shape, config changes cannot cause cache staleness (there's nothing in the cache to be stale). |
| D7 | **`getAdminAreaLabel(level)` is kept** — it's used directly in a few non-disaggregation sites (stats cards, dropdowns) and is simpler than constructing a fake `disOpt`. It becomes a thin wrapper around the lib helper. |
| D8 | **The "dependency tracking touch"** at `client/src/components/project_ai/index.tsx:58` has `d.label` removed from its touch expression. No functional change — `d.value` and `d.isRequired` alone already cover what Solid needs to track on this array. |
| D9 | **Naming**: lib file at `lib/disaggregation_labels.ts`. Client wrapper file renamed from `admin_area_label.ts` to `disaggregation_label.ts` to reflect its broader scope. |
| D10 | **Zero DB, zero wire-format changes.** Labels were never persisted. API responses shrink (one field per disaggregation option), but no route signatures change, no migration needed. |
| D11 | **Scope**: admin areas AND facility columns get this treatment in the same PR. Not split. Splitting would leave one half on the old baked-label pattern and perpetuate the inconsistency that triggered this refactor. |

---

## File-by-file changes

### 1. New file: [lib/disaggregation_labels.ts](lib/disaggregation_labels.ts)

Create. This is the heart of the refactor — a single source of truth for disaggregation display labels.

```ts
import type {
  DisaggregationOption,
  PresentationOption,
  InstanceConfigAdminAreaLabels,
  InstanceConfigFacilityColumns,
} from "./types/mod.ts";
import type { TranslatableString } from "./translate/mod.ts";

export type DisaggregationLabelConfig = {
  adminAreaLabels?: InstanceConfigAdminAreaLabels;
  facilityColumns?: InstanceConfigFacilityColumns;
};

export function getDisaggregationLabel(
  disOpt: DisaggregationOption,
  config: DisaggregationLabelConfig,
): TranslatableString {
  // Admin areas — config-driven
  if (disOpt === "admin_area_2" || disOpt === "admin_area_3" || disOpt === "admin_area_4") {
    const level = Number(disOpt.slice(-1)) as 2 | 3 | 4;
    const custom = config.adminAreaLabels?.[`label${level}`];
    if (custom) return { en: custom, fr: custom };
    return { en: `Admin area ${level}`, fr: `Unité administrative ${level}` };
  }

  // Facility columns — config-driven
  if (disOpt === "facility_type") {
    const custom = config.facilityColumns?.labelTypes;
    if (custom) return { en: custom, fr: custom };
    return { en: "Facility type", fr: "Facility type" };
  }
  if (disOpt === "facility_ownership") {
    const custom = config.facilityColumns?.labelOwnership;
    if (custom) return { en: custom, fr: custom };
    return { en: "Facility ownership", fr: "Facility ownership" };
  }
  if (disOpt === "facility_custom_1" || disOpt === "facility_custom_2" ||
      disOpt === "facility_custom_3" || disOpt === "facility_custom_4" ||
      disOpt === "facility_custom_5") {
    const n = Number(disOpt.slice(-1)) as 1 | 2 | 3 | 4 | 5;
    const custom = config.facilityColumns?.[`labelCustom${n}`];
    if (custom) return { en: custom, fr: custom };
    return { en: `Facility custom ${n}`, fr: `Facility custom ${n}` };
  }

  // Static defaults — not config-driven
  switch (disOpt) {
    case "period_id":             return { en: "Year/Month", fr: "Année/Mois" };
    case "quarter_id":            return { en: "Year/Quarter", fr: "Année/Trimestre" };
    case "year":                  return { en: "Year", fr: "Année" };
    case "month":                 return { en: "Month", fr: "Mois" };
    case "indicator_common_id":   return { en: "Indicator", fr: "Indicateur" };
    case "denominator":           return { en: "Denominator", fr: "Denominator" };
    case "denominator_best_or_survey": return { en: "Denominator (best or survey)", fr: "Denominator (best or survey)" };
    case "source_indicator":      return { en: "Source indicator", fr: "Source indicator" };
    case "target_population":     return { en: "Target population", fr: "Target population" };
    case "ratio_type":            return { en: "Ratio type", fr: "Type de ratio" };
    case "hfa_indicator":         return { en: "HFA indicator", fr: "HFA indicator" };
    case "hfa_category":          return { en: "HFA category", fr: "HFA category" };
    case "time_point":            return { en: "Time point", fr: "Time point" };
    default:                      return { en: String(disOpt), fr: String(disOpt) };
  }
}

const TIME_BASED: PresentationOption[] = ["table", "chart"];

export function getDisaggregationAllowedPresentationOptions(
  disOpt: DisaggregationOption,
): PresentationOption[] | undefined {
  switch (disOpt) {
    case "period_id":
    case "quarter_id":
    case "year":
    case "month":
    case "time_point":
      return TIME_BASED;
    default:
      return undefined;
  }
}
```

Export from `lib/mod.ts` (re-export barrel).

### 2. [lib/types/module_definitions.ts](lib/types/module_definitions.ts)

**Drop `label` from `ResultsValue.disaggregationOptions`** — [line 103](lib/types/module_definitions.ts#L103).

New shape ([lines 101-106](lib/types/module_definitions.ts#L101-L106)):
```ts
disaggregationOptions: {
  value: DisaggregationOption;
  isRequired: boolean;
  allowedPresentationOptions?: PresentationOption[];
}[];
```

Remove the unused `TranslatableString` import if nothing else in the file uses it (verify).

### 3. [server/db/project/metric_enricher.ts](server/db/project/metric_enricher.ts) — major simplification

The whole `getDisaggregationMetadata` function (lines 63-122) goes away. Remove `DisaggregationMetadata` type and the inline `adminAreaLabel` helper (lines 74-78).

`buildDisaggregationOptions` (lines 124-236) becomes significantly smaller — it no longer computes labels, only decides which disOpts exist based on column presence, facility config (for enabling facility disOpts), and period granularity.

New shape of `buildDisaggregationOptions`:

```ts
async function buildDisaggregationOptions(
  requiredOptions: DisaggregationOption[],
  resultsObjectId: string,
  projectDb: Sql,
  facilityConfig: InstanceConfigFacilityColumns | undefined,
): Promise<ResultsValue["disaggregationOptions"]> {
  const out: ResultsValue["disaggregationOptions"] = [];
  const tableName = getResultsObjectTableName(resultsObjectId);

  const physicalColumnsToCheck: DisaggregationOption[] = [
    "admin_area_2", "admin_area_3", "admin_area_4",
    "indicator_common_id", "denominator", "denominator_best_or_survey",
    "source_indicator", "target_population", "ratio_type",
    "hfa_indicator", "hfa_category", "time_point",
  ];

  for (const disOpt of physicalColumnsToCheck) {
    if (await detectColumnExists(projectDb, tableName, disOpt)) {
      out.push({
        value: disOpt,
        isRequired: requiredOptions.includes(disOpt),
        allowedPresentationOptions: getDisaggregationAllowedPresentationOptions(disOpt),
      });
    }
  }

  // Facility columns — existence is gated by facilityConfig.include* flags,
  // NOT by label presence. Labels are render-time.
  if (facilityConfig) {
    const hasFacilityId = await detectColumnExists(projectDb, tableName, "facility_id");
    if (hasFacilityId) {
      const facilityOptions: { option: DisaggregationOption; enabled: boolean }[] = [
        { option: "facility_type",     enabled: facilityConfig.includeTypes },
        { option: "facility_ownership", enabled: facilityConfig.includeOwnership },
        { option: "facility_custom_1", enabled: facilityConfig.includeCustom1 },
        { option: "facility_custom_2", enabled: facilityConfig.includeCustom2 },
        { option: "facility_custom_3", enabled: facilityConfig.includeCustom3 },
        { option: "facility_custom_4", enabled: facilityConfig.includeCustom4 },
        { option: "facility_custom_5", enabled: facilityConfig.includeCustom5 },
      ];
      for (const f of facilityOptions) {
        if (!f.enabled) continue;
        out.push({
          value: f.option,
          isRequired: requiredOptions.includes(f.option),
          allowedPresentationOptions: getDisaggregationAllowedPresentationOptions(f.option),
        });
      }
    }
  }

  // Time columns
  const hasPeriodId = await detectColumnExists(projectDb, tableName, "period_id");
  if (hasPeriodId) {
    for (const disOpt of ["year", "month", "quarter_id", "period_id"] as DisaggregationOption[]) {
      out.push({
        value: disOpt,
        isRequired: requiredOptions.includes(disOpt),
        allowedPresentationOptions: getDisaggregationAllowedPresentationOptions(disOpt),
      });
    }
  } else if (await detectColumnExists(projectDb, tableName, "quarter_id")) {
    for (const disOpt of ["quarter_id", "year"] as DisaggregationOption[]) {
      out.push({
        value: disOpt,
        isRequired: requiredOptions.includes(disOpt),
        allowedPresentationOptions: getDisaggregationAllowedPresentationOptions(disOpt),
      });
    }
  } else if (await detectColumnExists(projectDb, tableName, "year")) {
    out.push({
      value: "year",
      isRequired: requiredOptions.includes("year"),
      allowedPresentationOptions: getDisaggregationAllowedPresentationOptions("year"),
    });
  }

  return out;
}
```

**Consequences**:
- `enrichMetric` no longer takes `adminAreaLabels` — drop the parameter ([line 26](server/db/project/metric_enricher.ts#L26)).
- `resolveMetricById` no longer takes `adminAreaLabels` — drop the parameter.
- Imports: drop `InstanceConfigAdminAreaLabels` and `TranslatableString`, add `getDisaggregationAllowedPresentationOptions`.

### 4. [server/db/project/results_value_resolver.ts](server/db/project/results_value_resolver.ts)

Drop the `adminAreaLabels` parameter ([line 19](server/db/project/results_value_resolver.ts#L19)) and the forward ([line 32](server/db/project/results_value_resolver.ts#L32)). Drop the `InstanceConfigAdminAreaLabels` import.

### 5. [server/db/project/modules.ts](server/db/project/modules.ts)

Three call sites of `enrichMetric`:

- [line 675](server/db/project/modules.ts#L675) (`getMetricsListForAI`)
- [line 873](server/db/project/modules.ts#L873) (`getAllMetrics`)
- [line 920](server/db/project/modules.ts#L920) (`getMetricsWithStatus`)

For all three: remove the `adminAreaLabels` argument from the `enrichMetric` call.

For `getAllMetrics` ([lines 850-884](server/db/project/modules.ts#L850-L884)) and `getMetricsWithStatus` ([lines 886-956](server/db/project/modules.ts#L886-L956)): remove the `adminAreaLabelsResult` fetch (lines 861-864 / 897-900) and its unused variable entirely. Remove `getAdminAreaLabelsConfig` from the import at [line 33](server/db/project/modules.ts#L33) if now unused in the file.

For `getMetricsListForAI` ([lines 612-843](server/db/project/modules.ts#L612-L843)): KEEP the `adminAreaLabelsResult` fetch — it's now used differently. The inline optional-dimension emission at [line 752](server/db/project/modules.ts#L752) currently reads `getAIStr(opt.label)`. Change to:

```ts
const label = getDisaggregationLabel(opt.value, {
  adminAreaLabels,
  facilityColumns: facilityConfig,
}).en;
lines.push(`      - ${opt.value} (${label})`);
```

`getDisaggregationLabel` has strict return type `TranslatableString`, so `.en` is clearer than wrapping in `getAIStr` (which handles a `string | { en, fr }` union we don't have here). Add import of `getDisaggregationLabel` from `lib`.

### 6. [server/server_only_funcs_presentation_objects/get_results_value_info.ts](server/server_only_funcs_presentation_objects/get_results_value_info.ts)

Drop the `adminAreaLabelsResult` fetch (lines 33-36) and the forward to `resolveMetricById` (line 43). Remove `getAdminAreaLabelsConfig` from the imports at line 14.

### 7. [server/db/project/presentation_objects.ts](server/db/project/presentation_objects.ts)

Drop the `resAdminAreaLabels` fetch ([lines 189-190](server/db/project/presentation_objects.ts#L189-L190)) and the forward to `resolveMetricById` ([line 197](server/db/project/presentation_objects.ts#L197)). Remove `getAdminAreaLabelsConfig` from the imports if now unused in the file.

### 8. Client: rename [client/src/state/instance/admin_area_label.ts](client/src/state/instance/admin_area_label.ts) → `client/src/state/instance/disaggregation_label.ts`

New content:

```ts
import type { DisaggregationOption, TranslatableString } from "lib";
import { getDisaggregationLabel } from "lib";
import { instanceState } from "./t1_store";

export function getDisplayDisaggregationLabel(disOpt: DisaggregationOption): TranslatableString {
  return getDisaggregationLabel(disOpt, {
    adminAreaLabels: instanceState.adminAreaLabels,
    facilityColumns: instanceState.facilityColumns,
  });
}

export function getAdminAreaLabel(level: 1 | 2 | 3 | 4): TranslatableString {
  if (level === 1) {
    // admin_area_1 is not a disaggregation option; handle the one-off default here.
    const custom = instanceState.adminAreaLabels.label1;
    if (custom) return { en: custom, fr: custom };
    return { en: "Admin area 1", fr: "Unité administrative 1" };
  }
  return getDisaggregationLabel(`admin_area_${level}`, {
    adminAreaLabels: instanceState.adminAreaLabels,
  });
}
```

Key differences from the old helper:
- `getDisplayDisaggregationLabel` now takes a `DisaggregationOption` (a string) rather than an object `{ value, label }`. Simpler signature — callers no longer pass the now-deleted `label` field.
- Covers facility columns too, not just admin areas.
- SolidJS reactivity: reads from `instanceState.adminAreaLabels` / `instanceState.facilityColumns` on every call; tracked in JSX scope.

### 9. Client render-site updates (call signature change)

Every site that imports from `admin_area_label` updates its import to `disaggregation_label` and changes the call from `getDisplayDisaggregationLabel(p.disOpt)` (object) to `getDisplayDisaggregationLabel(p.disOpt.value)` (string):

| File | Line | Change |
|---|---|---|
| [client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx) | 28 | import path |
| **"** | 454 | pass `.value` |
| [client/src/components/visualization/presentation_object_editor_panel_data/_3_disaggregation.tsx](client/src/components/visualization/presentation_object_editor_panel_data/_3_disaggregation.tsx) | 14 | import path |
| **"** | 111 | pass `.value` |
| **"** | 160 | pass `.value` |
| [client/src/components/project/metric_details_modal.tsx](client/src/components/project/metric_details_modal.tsx) | 4 | import path |
| **"** | 142 | pass `.value` |
| [client/src/components/project/add_visualization.tsx](client/src/components/project/add_visualization.tsx) | 25 | import path |
| **"** | 263 | pass `.value` |
| **"** | 287 | pass `.value` |
| [client/src/components/instance/instance_data.tsx](client/src/components/instance/instance_data.tsx) | 11 | import path only (still uses `getAdminAreaLabel`) |
| [client/src/components/structure_import/step_4.tsx](client/src/components/structure_import/step_4.tsx) | 18 | import path only |
| [client/src/components/instance_geojson/geojson_upload_wizard.tsx](client/src/components/instance_geojson/geojson_upload_wizard.tsx) | 14 | import path only |

### 10. [client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx](client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx)

[Line 131](client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx#L131) currently does `const label = typeof opt.label === "string" ? opt.label : opt.label.en;`. Replace with:

```ts
import { getDisaggregationLabel } from "lib";
import { instanceState } from "~/state/instance/t1_store";
// ...
const label = getDisaggregationLabel(opt.value, {
  adminAreaLabels: instanceState.adminAreaLabels,
  facilityColumns: instanceState.facilityColumns,
}).en;
```

### 11. [client/src/components/project_ai/index.tsx](client/src/components/project_ai/index.tsx)

[Line 58](client/src/components/project_ai/index.tsx#L58): remove `d.label` from the Solid dependency touch expression:

```ts
m.disaggregationOptions.forEach(d => { const _d = d.value + d.isRequired; });
```

### 12. Dead code removal

After the above:
- `server/db/project/metric_enricher.ts`: `getDisaggregationMetadata` and `DisaggregationMetadata` type are fully gone.
- `server/db/instance/config.ts::getAdminAreaLabelsConfig` is still used by `instance.ts` (fetching for the `InstanceState` payload) and `modules.ts::getMetricsListForAI`. KEEP.
- `server/db/mod.ts`: if re-exports include `getAdminAreaLabelsConfig` still fine.
- Remove the now-unused `TranslatableString` import from `metric_enricher.ts` if truly unused.

### 13. Auto-handled (no changes needed)

- `_PO_DETAIL_CACHE` in [client/src/state/caches/visualizations.ts](client/src/state/caches/visualizations.ts) — once `label` is gone from the enriched shape, cached entries can't be stale on config change. No invalidation logic to write.
- PDF/PPT/DOCX exports that read `disaggregationOptions[].label` — **none exist** (inventory confirmed; exports use `resultsValue.label`, `variantLabel`, item data, not disOpt labels).
- `ItemsHolderPresentationObject`, `PresentationObjectDetail` — contain `ResultsValue` by embedding, so the type narrowing cascades. TypeScript will flag every stale `opt.label` read.

---

## Change checklist

Lib:
- [ ] Create `lib/disaggregation_labels.ts` with `getDisaggregationLabel` + `getDisaggregationAllowedPresentationOptions`
- [ ] Add `export * from "./disaggregation_labels.ts";` to `lib/mod.ts` (barrel is auto-barrel style; must add the new line explicitly)
- [ ] Drop `label` from `ResultsValue.disaggregationOptions[]` in `lib/types/module_definitions.ts`

Server:
- [ ] Gut `getDisaggregationMetadata` in `metric_enricher.ts` (whole function deleted)
- [ ] Rewrite `buildDisaggregationOptions` per section 3 above
- [ ] Drop `adminAreaLabels` param from `enrichMetric`
- [ ] Drop `adminAreaLabels` param from `resolveMetricById` in `results_value_resolver.ts`
- [ ] Update 3 call sites in `modules.ts`: drop arg; remove unused fetches in `getAllMetrics` and `getMetricsWithStatus`
- [ ] In `getMetricsListForAI`: replace `opt.label` usage with `getDisaggregationLabel(opt.value, { ... })`
- [ ] Drop `adminAreaLabels` fetch + forward in `presentation_objects.ts`
- [ ] Drop `adminAreaLabels` fetch + forward in `get_results_value_info.ts`

Client:
- [ ] Rename `admin_area_label.ts` → `disaggregation_label.ts`; rewrite per section 8
- [ ] Update imports + `getDisplayDisaggregationLabel` call signature in 4 components (filters, disaggregation, metric_details_modal, add_visualization)
- [ ] Update import paths in 3 components that only use `getAdminAreaLabel` (instance_data, step_4, geojson_upload_wizard)
- [ ] Replace label extraction in `visualization_editor.tsx` with `getDisaggregationLabel` call
- [ ] Remove `d.label` from dependency touch in `project_ai/index.tsx`

Verification:
- [ ] `deno task typecheck` passes (server + client). TypeScript will flag any missed `opt.label` read.
- [ ] Browser smoke test: change an admin area label in settings → verify it updates live in a currently-open viz editor, disaggregation panel, metric modal, filter panel.
- [ ] Same test for a facility column label (`labelTypes`, `labelCustom1`) — this is where the pre-refactor code was quietly broken on cached metrics; should now be fixed uniformly.
- [ ] Clear all custom labels → defaults restored everywhere.
- [ ] Open a project, exercise AI tools → confirm AI prompt still contains readable dimension labels.

---

## Risk review

- **Type narrowing correctly flags every site**: dropping `label` from an exported type will produce compile errors at every stale reader. The inventory identified 10 sites; TypeScript will catch any missed.
- **SolidJS reactivity**: the client wrapper reads two store paths on every call (`instanceState.adminAreaLabels` and `instanceState.facilityColumns`). Solid tracks property reads through the store proxy; JSX expressions re-run when either updates. Matches the existing proven pattern used by `getDisplayDisaggregationLabel` today.
- **Server-side performance**: no change. `getMetricsListForAI` already fetches both configs; `getAllMetrics` / `getMetricsWithStatus` lose one config fetch each.
- **Module defs / R scripts**: untouched. Module definitions declare disaggregation *values*, never labels.
- **Persisted presentation-object configs**: unaffected. They reference disOpts by value, never cache a label.
- **i18n footprint**: identical. The same English/French strings move from the enricher to the lib helper.
- **Rollback**: entirely local refactor, no data/schema. Git revert is clean.
- **Verbatim default-text preservation**: the English/French defaults in `getDisaggregationLabel` are copied verbatim from today's `metric_enricher.ts` (including the intentional cases where `en === fr`, e.g. `"Denominator" / "Denominator"`, `"Facility type" / "Facility type"`, `"Facility custom N" / "Facility custom N"`). This refactor is not silently "fixing" incomplete French translations; that's a separate concern.

---

## What this fixes

- Eliminates the split-brain pattern where admin area labels had a client override but facility column labels didn't. Both now behave identically.
- Removes the latent cache-staleness bug: before this refactor, a user who changed `labelCustom1` in settings would see old labels on cached metrics until a full page reload. After: labels are computed at render time from live store, never cached.
- `metric_enricher.ts` loses ~55 lines of hardcoded display-string metadata that never belonged in a data-enrichment function.
- Adds one file (~60 lines) that is the single grep target for "where does the label for disaggregation option X come from" — for the next 5 years.
