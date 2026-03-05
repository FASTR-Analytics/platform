# Plan: Introduce Maps into WB-FASTR

## Context

FASTR needs geographic map visualizations. Panther already has a complete map rendering pipeline (`MapInputs`, projections, color scales, multi-panel support) — including `FigureInputs` union type with `MapInputs`, `MapRenderer` with `.isType()` dispatch, and all geo rendering. The work is connecting it to FASTR's data and visualization infrastructure.

Two phases: (1) GeoJSON upload, pre-processing, and storage; (2) Map presentation type in the viz system.

---

## Phase 1: GeoJSON Upload & Storage

### 1.1 Database Migration

**New file:** `server/db/migrations/instance/010_add_geojson_maps.sql`

```sql
CREATE TABLE IF NOT EXISTS geojson_maps (
  admin_area_level integer PRIMARY KEY CHECK (admin_area_level IN (2, 3, 4)),
  geojson text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
```

**Update:** `server/db/instance/_main_database.sql` — add the same `CREATE TABLE geojson_maps` block to the base schema (so fresh instances get the table without running migrations).

Level 1 is excluded because it is always "national" (a single area) — mapping a single region is pointless.

The `geojson` column stores the **pre-processed** GeoJSON (with admin area names as feature IDs), stringified as text. The original uploaded file is never persisted — it's only used during the mapping step.

### 1.2 Types

**New file:** `lib/types/geojson_maps.ts`

- `GeoJsonMapSummary` — `{ admin_area_level: number; uploadedAt: string }` (used in InstanceDetail and route responses)

Transient request/response shapes (upload analysis results, area mappings) are defined inline in the route registry, following the existing pattern (see `structureRouteRegistry`, `assetRouteRegistry`).

**Update:** `lib/types/instance.ts` — add `geojsonMaps: GeoJsonMapSummary[]` to `InstanceDetail`

### 1.3 API Routes

**New file:** `lib/api-routes/instance/geojson_maps.ts`

| Route | Method | Purpose |
|-------|--------|---------|
| `getGeoJsonMaps` | GET | List which levels have GeoJSON (summary only) |
| `analyzeGeoJsonUpload` | POST | Upload raw GeoJSON as JSON body, return property names + sample values for mapping UI |
| `saveGeoJsonMap` | POST | Accept mapping + raw GeoJSON + level → pre-process and store |
| `deleteGeoJsonMap` | DELETE | Remove a level's GeoJSON |
| `getGeoJsonForLevel` | GET | Serve the processed GeoJSON text for a given level (used by client rendering) |

`analyzeGeoJsonUpload` and `saveGeoJsonMap` use direct JSON body POST (not TUS). GeoJSON for country boundaries is typically 1-30MB — well within normal POST limits. TUS is overkill for this use case (no resumability needed, file is parsed immediately).

**Update:** `lib/api-routes/combined.ts` — import and spread `geojsonMapRouteRegistry` into the combined `routeRegistry`.

**New file:** `server/routes/instance/geojson_maps.ts`

Follows existing pattern: `defineRoute()` with `requireGlobalPermission("can_configure_data")` for mutations, `requireGlobalPermission()` (no args = any authenticated global user) for reads.

**Update:** `main.ts` — import `routesGeoJsonMaps` and add `app.route("/", routesGeoJsonMaps)` alongside existing instance routes.

### 1.4 DB Functions

**New file:** `server/db/instance/geojson_maps.ts`

- `getGeoJsonMapSummaries(mainDb)` → `GeoJsonMapSummary[]`
- `getGeoJsonForLevel(mainDb, level)` → `string | null`
- `saveGeoJsonMap(mainDb, level, processedGeoJson)` → upsert
- `deleteGeoJsonMap(mainDb, level)` → delete

### 1.5 GeoJSON Pre-processing Logic

**New file:** `server/geojson/process_geojson.ts`

Core function: takes raw GeoJSON + `areaMatchProp` (which property to read from features) + area mapping (`Record<string, string>`, mapping admin area names → feature property values) → produces a new GeoJSON where each feature's match property is replaced with the admin area name.

This means at render time, `areaProp` and `areaMatchProp` are both the admin area column name (e.g. `"admin_area_2"`), and the GeoJSON features have that value directly. No mapping lookups at render time.

Also: `analyzeGeoJson(rawGeoJson)` — parse, extract unique property names, sample values per property (for the mapping UI).

### 1.6 Client Components

**New directory:** `client/src/components/instance/instance_geojson/`

Entry from `instance_data.tsx` via the same Switch/Match pattern used for indicators/structure.

- `geojson_manager.tsx` — main component showing which levels have GeoJSON uploaded, with upload/delete actions
- `geojson_upload_wizard.tsx` — multi-step flow:
  1. File upload (accepts .geojson/.json)
  2. Select admin area level (2, 3, or 4)
  3. Select which GeoJSON property to match on (dropdown from `analyzeGeoJsonUpload` response)
  4. Mapping table: admin area names (from DB) ↔ GeoJSON feature values (auto-matched by string similarity, with manual override dropdowns)
  5. Confirm and save

### 1.7 Client-side GeoJSON Caching

GeoJSON is instance-level, rarely changes, and potentially large. Cache strategy:

- Store in **IndexedDB** via `idb-keyval` (same as existing reactive cache)
- Cache key: `geojson:{level}:{uploadedAt}`
- The `uploadedAt` timestamp from `InstanceDetail.geojsonMaps` acts as the version — if it changes, the cached entry is stale and the old key is orphaned (cleaned up on next access or via periodic cleanup)
- On first map render needing level X: check IndexedDB → if stale/missing, fetch from `getGeoJsonForLevel` → store → use
- Simple helper: `getGeoJsonCached(level: number, uploadedAt: string): Promise<GeoJSONFeatureCollection>`

This is NOT the reactive cache system (that's for project-level PDS-versioned data). This is a simpler instance-level cache.

---

## Phase 2: Map Presentation Type

### 2.1 Type Changes

**`lib/types/presentation_objects.ts`:**

- `PresentationOption` → `"timeseries" | "table" | "chart" | "map"`
- Add `"mapArea"` to `DisaggregationDisplayOption` type — represents the geographic axis of a map
- Add `map` entry to `VIZ_TYPE_CONFIG`:
  - `defaultValuesDisDisplayOpt: "cell"` (multi-pane maps by default)
  - `defaultContent: "bars"` (unused for maps, but harmless — map rendering ignores it)
  - `disaggregationDisplayOptions: ["mapArea", "cell", "row", "col", "replicant"]`
  - `disDisplayOptFallbacks: { series: "cell", indicator: "cell", rowGroup: "row", colGroup: "col" }`
  - `styleResets`: `{ specialScorecardTable: false, specialBarChart: false, specialCoverageChart: false, specialBarChartInverted: false, diffAreas: false, barsStacked: false, verticalTickLabels: false, sortIndicatorValues: "none" }`
- Add `"map"` entry to `get_DISAGGREGATION_DISPLAY_OPTIONS()` — needs new translation key `T.FRENCH_UI_STRINGS.map_area` (EN: "Map regions", FR: "Régions de la carte") for the `"mapArea"` label
- Update `get_PRESENTATION_SELECT_OPTIONS()` and `get_PRESENTATION_OPTIONS_MAP()` — needs new translation key `T.FRENCH_UI_STRINGS.map` (EN: "Map", FR: "Carte")

**`lib/types/presentation_objects.ts` — PresentationObjectConfig["s"]:**

Add optional map style fields:

- `mapColorFrom?: string` (default: light color like `"#fee0d2"`)
- `mapColorTo?: string` (default: dark color like `"#de2d26"`)
- `mapProjection?: "equirectangular" | "mercator" | "naturalEarth1"` (default: `"equirectangular"`)

Keep it minimal — can expand later (diverging scales, threshold scales, etc.).

**`lib/types/presentation_object_defaults.ts`:**

- Add map defaults to `DEFAULT_S_CONFIG`: `mapColorFrom: "#fee0d2"`, `mapColorTo: "#de2d26"`, `mapProjection: "equirectangular"`

### 2.2 Rendering Pipeline

**`client/src/generate_visualization/get_figure_inputs_from_po.ts`:**

Add fourth branch for `config.d.type === "map"`. Key difference from other types: this branch needs the GeoJSON data in addition to `ih.items`.

Signature change: add optional `geoJson?: GeoJSONFeatureCollection` parameter. For non-map types this is ignored. For maps, the caller must provide it.

**Callers that need updating** (5 files):

1. `client/src/state/po_cache.ts` — main cache pipeline, fetches GeoJSON from IndexedDB cache before calling
2. `client/src/components/visualization/visualization_editor_inner.tsx` — live preview in editor
3. `client/src/components/project/preset_preview.tsx` — preset picker preview
4. `client/src/components/slide_deck/slide_editor/index.tsx` — slide figure rendering
5. `client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts` — AI slide generation

For callers 2-5, when `config.d.type === "map"`, they need to await the GeoJSON cache helper before calling `getFigureInputsFromPresentationObject`. For non-map types, no change in behavior.

Note: No changes needed to panther. `FigureInputs` already includes `MapInputs` in its union type, and `FigureRenderer` already dispatches to `MapRenderer` via `.isType()` checks.

**New file:** `client/src/generate_visualization/get_data_config_for_map.ts`

- `getMapJsonDataConfigFromPresentationObjectConfig()` — builds panther's `MapJsonDataConfig`:
  - `areaProp`: the disaggregation with `disDisplayOpt: "mapArea"` (e.g., `"admin_area_2"`)
  - `areaMatchProp`: same value (since GeoJSON is pre-processed)
  - `valueProp`: from resultsValue.valueProps
  - `paneProp`/`tierProp`/`laneProp`: from other disaggregation display options (same pattern as chart/timeseries)

**`client/src/generate_visualization/get_style_from_po.ts`:**

Add map-specific style block when `config.d.type === "map"`:

```typescript
map: {
  projection: config.s.mapProjection ?? "equirectangular",
  colorScale: { type: "sequential", colors: [config.s.mapColorFrom ?? "#fee0d2", config.s.mapColorTo ?? "#de2d26"] },
  regionStrokeColor: "#666",
  regionStrokeWidth: 0.5,
  noDataColor: "#f0f0f0",
  padding: 10,
}
```

### 2.3 How Maps Use the Existing `d` Config

A map vizPreset example:

```typescript
{
  id: "coverage-map",
  label: { en: "Coverage map", fr: "Carte de couverture" },
  allowedFilters: ["indicator_common_id"],
  config: {
    d: {
      type: "map",
      periodOpt: "period_id",
      valuesDisDisplayOpt: "cell",
      disaggregateBy: [
        { disOpt: "admin_area_2", disDisplayOpt: "mapArea" },
      ],
      filterBy: [],
    },
    s: {
      mapColorFrom: "#fee0d2",
      mapColorTo: "#de2d26",
    },
  },
}
```

The rendering pipeline sees `type: "map"` and inspects `disaggregateBy` for a `disDisplayOpt: "mapArea"` entry → that determines which level's GeoJSON to load and which column is the `areaProp`. Other disaggregations become `paneProp`/`tierProp`/`laneProp` for multi-panel map layouts.

No new fields needed in `d` — the admin area level is derived from whichever `admin_area_X` disaggregation has `disDisplayOpt: "mapArea"`.

### 2.4 Additional Touchpoints for `"mapArea"` Display Option

- **`lib/convert_visualization_type.ts`** — add `mapArea` fallback in each non-map type's `disDisplayOptFallbacks` (e.g., `{ mapArea: "cell" }` for chart/timeseries, `{ mapArea: "row" }` for table). Handles converting a map PO to another viz type.
- **`client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx`** — hardcodes `VALID_DIS_DISPLAY` and `VALID_VALUES_DISPLAY` per type. Add `map` entries: `VALID_DIS_DISPLAY.map = ["mapArea", "cell", "row", "col", "replicant"]`, `VALID_VALUES_DISPLAY.map = ["cell", "row", "col"]`.
- **`client/src/components/visualization/presentation_object_editor_panel_data/_3_disaggregation.tsx`** — exclude `"mapArea"` from values display option dropdown (same treatment as `"replicant"`). Hide "Include National" checkbox when `disDisplayOpt === "mapArea"`.

No changes needed to: `get_fetch_config_from_po.ts` (only `disOpt` matters for SQL), `getDisaggregatorDisplayProp` (generic logic), duplicate detection, next-available picker.

### 2.5 Module Definition Updates

Add `allowedPresentationOptions: ["map"]` or `["table", "chart", "map"]` to relevant disaggregation options in module definitions where admin area maps make sense.

Add vizPresets with `type: "map"` to modules that produce admin-area-level data (likely m001, m002, etc.).

### 2.6 UI Updates

**`client/src/components/project/add_visualization.tsx`:**

- Include `"map"` in presentation option selector
- When `"map"` is selected, require at least one admin_area disaggregation with `disDisplayOpt: "mapArea"`
- Show map-specific style options (color range, projection)

**`client/src/components/project/preset_preview.tsx`:**

- Handle map preview — needs GeoJSON available via cache helper, or show a placeholder if GeoJSON not yet uploaded for the required level

**`client/src/components/project/presentation_object_editor/`:**

- Add map style controls (color pickers for from/to, projection dropdown)

---

## Implementation Order

1. Phase 1 first (standalone, doesn't break anything)
   - 1.1 Migration + schema + types
   - 1.2 Server (DB functions, routes, processing logic, combined.ts registration)
   - 1.3 Client (manager component, upload wizard)
   - 1.4 Caching helper

2. Phase 2 (depends on Phase 1)
   - 2.1 Type changes (PresentationOption, DisaggregationDisplayOption, VIZ_TYPE_CONFIG, config.s fields, translation keys)
   - 2.2 Rendering pipeline (get_figure_inputs + all 5 callers, get_data_config, get_style)
   - 2.3 Additional touchpoints (convert_visualization_type, AI tool, disaggregation editor)
   - 2.4 UI updates (add_visualization, preset_preview, editor)
   - 2.5 Module vizPresets

## Key Files to Modify

**Phase 1:**

- `server/db/migrations/instance/010_add_geojson_maps.sql` (new)
- `server/db/instance/_main_database.sql` (add table)
- `server/db/instance/geojson_maps.ts` (new)
- `server/routes/instance/geojson_maps.ts` (new)
- `server/geojson/process_geojson.ts` (new)
- `lib/api-routes/instance/geojson_maps.ts` (new)
- `lib/api-routes/combined.ts` (add geojsonMapRouteRegistry)
- `main.ts` (import and mount routesGeoJsonMaps)
- `lib/types/geojson_maps.ts` (new)
- `lib/types/instance.ts` (add geojsonMaps to InstanceDetail)
- `server/db/instance/instance.ts` (update getInstanceDetail to include geojson summaries)
- `client/src/components/instance/instance_geojson/` (new directory)
- `client/src/components/instance/instance_data.tsx` (add routing)
- `client/src/state/caches/geojson_cache.ts` (new)

**Phase 2:**

- `lib/types/presentation_objects.ts` (PresentationOption, DisaggregationDisplayOption, VIZ_TYPE_CONFIG, config.s fields)
- `lib/types/presentation_object_defaults.ts` (DEFAULT_S_CONFIG)
- `lib/translate/` (add translation keys for "map", "map_area")
- `lib/convert_visualization_type.ts` (mapArea fallbacks)
- `client/src/generate_visualization/get_figure_inputs_from_po.ts` (map branch + signature change)
- `client/src/generate_visualization/get_data_config_for_map.ts` (new)
- `client/src/generate_visualization/get_style_from_po.ts` (map style)
- `client/src/state/po_cache.ts` (pass GeoJSON to getFigureInputsFromPresentationObject)
- `client/src/components/visualization/visualization_editor_inner.tsx` (pass GeoJSON)
- `client/src/components/project/preset_preview.tsx` (pass GeoJSON or placeholder)
- `client/src/components/slide_deck/slide_editor/index.tsx` (pass GeoJSON)
- `client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts` (pass GeoJSON)
- `client/src/components/project/add_visualization.tsx` (map option)
- `client/src/components/visualization/presentation_object_editor_panel_data/_3_disaggregation.tsx` (mapArea exclusions)
- `client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx` (AI tool validation)
- Module definitions with map vizPresets

## Verification

- Phase 1: Upload a GeoJSON file for a test country, verify mapping UI works, confirm processed GeoJSON stored in DB, verify client cache fetches correctly
- Phase 2: Create a map presentation object from a vizPreset, verify it renders via panther's MapRenderer, test with filtered admin areas, test multi-panel maps
- Typecheck: `deno task typecheck` passes after each phase
