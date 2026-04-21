# Plan: Server-Side Report to Slides Migration

Migrate old `slide_deck` type reports to the new slides system via a server-side startup migration, similar to `migrateToMetricsTables`.

## Context

- 200 projects across 29 instances
- Current migration is client-side UI button (`client/src/components/project/migrate_reports_to_slides.tsx`)
- Client-side approach requires manual trigger per project — not scalable

## Current Client-Side Migration

Location: `client/src/components/project/migrate_reports_to_slides.tsx`

What it does:
1. Creates "Old reports" folder
2. For each `slide_deck` type report:
   - Creates new slide deck
   - Converts report config → slide deck config
   - For each report item:
     - Cover → CoverSlide
     - Section → SectionSlide
     - Freeform → ContentSlide (with layout conversion)
   - For figures: fetches PO data, generates `figureInputs`

Key functions:
- `mapReportConfigToSlideDeckConfig()` — clean mapping, reusable
- `convertReportItemToSlide()` — handles cover/section/freeform
- `convertLayoutNode()` — recursive layout conversion
- `convertContentItem()` — handles text/image/figure blocks

## Why Server-Side is Non-Trivial

Figure generation requires:
1. `getPresentationObjectItems()` — server function, returns `ItemsHolderPresentationObject`
2. `getFigureInputsFromPresentationObject()` — **currently client-only**, transforms to `FigureInputs`
3. `stripFigureInputsForStorage()` — removes style/geoData before saving

The transformation logic lives in `client/src/generate_visualization/` and must be moved to shared `lib/`.

## Architecture Decision: FigureInputs

**Key finding:** `figureInputs` cannot be regenerated on demand.

Current behavior:
- `stripFigureInputsForStorage()` — removes `style` and `geoData` before saving
- `hydrateFigureInputsForRendering()` — adds back `style` and `geoData` at render time
- Core data (`tableData`, `chartData`, `timeseriesData`, etc.) is NOT regenerated

If `figureInputs` is missing at render time → shows spacer placeholder, NOT regenerated.

**Implication:** Migration must compute and store `figureInputs` for each figure.

## Implementation Plan

### Phase 1: Move Figure Generation to lib/

Move `client/src/generate_visualization/` → `lib/generate_visualization/`

**Files to move:**
```
get_figure_inputs_from_po.ts      # main entry
get_data_config_from_po.ts        # needs countryIso3 param change
get_data_config_for_map.ts
get_style_from_po/                # whole directory
conditional_formatting.ts
conditional_formatting_scorecard.ts
get_date_label_replacements.ts
format_admin_area_labels.ts
get_admin_area_level_from_config.ts
```

**Files that stay in client:**
```
strip_figure_inputs.ts            # hydrateFigureInputsForRendering stays (uses client cache)
                                  # stripFigureInputsForStorage moves (no deps)
```

**One code change required:**

In `get_data_config_from_po.ts`, change:
```ts
// Before (reads from client state)
const nigeriaAdminAreaLabelReplacements =
  instanceState.countryIso3 === CountryCodes.Nigeria && jsonArray
    ? getNigeriaAdminAreaLabelReplacements(jsonArray)
    : {};

// After (passed as parameter)
const nigeriaAdminAreaLabelReplacements =
  countryIso3 === CountryCodes.Nigeria && jsonArray
    ? getNigeriaAdminAreaLabelReplacements(jsonArray)
    : {};
```

Thread `countryIso3?: string` through:
1. `getFigureInputsFromPresentationObject()`
2. `getTimeseriesJsonDataConfigFromPresentationObjectConfig()`
3. `getChartOVJsonDataConfigFromPresentationObjectConfig()`
4. `getChartOHJsonDataConfigFromPresentationObjectConfig()`
5. `getTableJsonDataConfigFromPresentationObjectConfig()`

### Phase 2: Create Server Migration Function

File: `server/db/migrations/data_transforms/reports_to_slides.ts`

Pattern: Same as `migrateToMetricsTables` in `db_startup.ts`

```ts
const MIGRATION_ID = "js_migrate_reports_to_slides_2025_04";

export async function migrateReportsToSlides(
  projectDb: Sql,
  mainDb: Sql,
  projectId: string,
  countryIso3: string | undefined,
): Promise<MigrationStats> {
  // Check if already migrated
  const applied = await projectDb`
    SELECT migration_id FROM schema_migrations WHERE migration_id = ${MIGRATION_ID}
  `;
  if (applied.length > 0) {
    return { rowsChecked: 0, rowsTransformed: 0 };
  }

  // Get slide_deck type reports
  const reports = await projectDb<ReportRow[]>`
    SELECT id, config FROM reports 
    WHERE report_type = 'slide_deck' AND is_deleted = false
  `;

  if (reports.length === 0) {
    await projectDb`INSERT INTO schema_migrations (migration_id) VALUES (${MIGRATION_ID})`;
    return { rowsChecked: 0, rowsTransformed: 0 };
  }

  // Create "Old reports" folder
  const folderId = generateId();
  await projectDb`
    INSERT INTO slide_deck_folders (id, label, sort_order, last_updated)
    VALUES (${folderId}, 'Old reports', 0, ${new Date().toISOString()})
  `;

  // Load geoJson for maps (by admin level)
  const geoJsonMap = await loadGeoJsonMap(mainDb);

  // Process each report
  for (const report of reports) {
    await migrateReport(projectDb, mainDb, projectId, report, folderId, countryIso3, geoJsonMap);
  }

  // Mark complete
  await projectDb`INSERT INTO schema_migrations (migration_id) VALUES (${MIGRATION_ID})`;
  
  return { rowsChecked: reports.length, rowsTransformed: reports.length };
}
```

### Phase 3: Wire into db_startup.ts

```ts
// In dbStartUp(), after data transforms
const countryIso3 = await getCountryIso3FromConfig(sqlMain);

for (const project of projects) {
  const projectDb = getPgConnectionFromCacheOrNew(project.id, "READ_AND_WRITE");
  
  // ... existing migrations ...
  
  // Report to slides migration
  await migrateReportsToSlides(projectDb, sqlMain, project.id, countryIso3);
}
```

### Phase 4: Remove Client-Side Migration UI

After server migration is deployed and verified:

1. Remove `client/src/components/project/migrate_reports_to_slides.tsx`
2. Remove button from `client/src/components/project/project_settings.tsx` (lines 344-350)

## Data Flow

```
For each report of type 'slide_deck':
│
├─► Create slide_deck record
│   └─► mapReportConfigToSlideDeckConfig()
│
└─► For each report_item:
    │
    ├─► type: "cover" → CoverSlide (direct mapping)
    │
    ├─► type: "section" → SectionSlide (direct mapping)
    │
    └─► type: "freeform" → ContentSlide
        │
        └─► For each figure block:
            │
            ├─► Read PO config from presentation_objects table
            ├─► Read metric info from metrics table
            ├─► Call getPresentationObjectItems() for data
            ├─► Call getFigureInputsFromPresentationObject() (now in lib/)
            ├─► Call stripFigureInputsForStorage()
            └─► Store in slide config
```

## Dependencies

**Server functions (already exist):**
- `getPresentationObjectItems()` — `server/server_only_funcs_presentation_objects/`

**Lib functions (after Phase 1):**
- `getFigureInputsFromPresentationObject()` — transforms ItemsHolder → FigureInputs
- `stripFigureInputsForStorage()` — strips style/geoData

**DB tables to read:**
- `reports` — get slide_deck type reports
- `report_items` — get items for each report
- `presentation_objects` — get PO config for figures
- `metrics` — get resultsValue info (formatAs, valueProps)
- `results_objects` — for getPresentationObjectItems
- `instance_config` — get countryIso3
- `geojson_maps` — get geoJson for map figures

**DB tables to write:**
- `slide_decks` — create new decks
- `slides` — create slides
- `slide_deck_folders` — create "Old reports" folder
- `schema_migrations` — track completion

## Edge Cases

1. **Module hasn't run** — No results data, figure can't be generated. Log warning, create figure block with `source` but no `figureInputs` (will show as placeholder).

2. **PO deleted** — Figure references non-existent PO. Log warning, create text block with "[Missing figure]".

3. **Map without geoJson** — GeoJSON not uploaded for admin level. Log warning, map will render without geography.

4. **Report already migrated** — Tracked via `schema_migrations`, skipped on re-run.

## Prerequisite

**PLAN_01_SLIDE_SCHEMAS.md must be completed first.**

The migration writes to `slide_decks.config` and `slides.config`. These need strict schemas for:
1. Write-time validation
2. Ensuring migrated data is valid

## Validation

After implementation:
1. Run on test instance with reports
2. Verify slide decks appear in "Old reports" folder
3. Verify figures render correctly (not as spacers)
4. Verify cover/section/content slides match original report items
5. Run on all 29 instances

## Cleanup (Post-Migration)

After all instances migrated:
1. Remove client migration UI
2. Optionally: drop `reports` and `report_items` tables (or mark deprecated)
3. Remove `migrateReportsToSlides` from startup (becomes no-op via schema_migrations anyway)
