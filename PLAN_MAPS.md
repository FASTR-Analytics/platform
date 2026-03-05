# Plan: Introduce Maps into WB-FASTR

## Context

FASTR needs geographic map visualizations. Panther already has a complete map rendering pipeline (`MapInputs`, projections, color scales, multi-panel support) — including `FigureInputs` union type with `MapInputs`, `MapRenderer` with `.isType()` dispatch, and all geo rendering. The work is connecting it to FASTR's data and visualization infrastructure.

Two phases: (1) GeoJSON upload, pre-processing, and storage; (2) Map presentation type in the viz system.

---

## Phase 1: GeoJSON Upload & Storage [IMPLEMENTED]

### 1.1 Database

**Migration:** `server/db/migrations/instance/010_add_geojson_maps.sql`
**Schema:** `server/db/instance/_main_database.sql`

```sql
CREATE TABLE IF NOT EXISTS geojson_maps (
  admin_area_level integer PRIMARY KEY CHECK (admin_area_level IN (2, 3, 4)),
  geojson text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
```

Level 1 excluded — always "national" (single area), pointless to map.

The `geojson` column stores **pre-processed** GeoJSON as stringified text. All original properties are stripped — only `area_id` (mapped admin area name) and geometry are kept. The original uploaded file stays in assets as a reference.

### 1.2 Types

- `lib/types/geojson_maps.ts` — `GeoJsonMapSummary` type
- `lib/types/instance.ts` — `geojsonMaps: GeoJsonMapSummary[]` added to `InstanceDetail`

### 1.3 API Routes

`lib/api-routes/instance/geojson_maps.ts` + `lib/api-routes/combined.ts`

| Route | Method | Purpose |
|-------|--------|---------|
| `getGeoJsonMaps` | GET | List which levels have GeoJSON (summary only) |
| `analyzeGeoJsonUpload` | POST | Accept `assetFileName`, read from disk, return property names + values |
| `saveGeoJsonMap` | POST | Accept `assetFileName` + level + mapping → pre-process and store in DB |
| `deleteGeoJsonMap` | POST | Remove a level's GeoJSON |
| `getAdminAreaNamesForLevel` | GET | Return admin area names for a level (used by mapping UI) |
| `getGeoJsonForLevel` | GET | Serve the processed GeoJSON text (used by client rendering) |

File upload uses **Uppy/TUS** to assets (same pattern as indicator batch upload). Server reads from disk via `assetFileName` — no raw GeoJSON in POST body.

### 1.4 GeoJSON Pre-processing

`server/geojson/process_geojson.ts`

- `analyzeGeoJson(rawStr)` — parse, extract property names + unique values per property
- `processGeoJson(rawStr, areaMatchProp, areaMapping)` — produces new GeoJSON with only `area_id` property (mapped admin area name) + geometry. All other properties stripped. Unmapped features excluded.

The `area_id` property is a **fixed constant** — not level-dependent. In Phase 2, `areaMatchProp` will always be `"area_id"`.

### 1.5 Client Components

`client/src/components/instance_geojson/` (sibling to `instance_dataset_hfa/`, `indicators/`, etc.)

- `geojson_manager.tsx` — table of uploaded levels, upload/delete actions
- `geojson_upload_wizard.tsx` — 4-step editor modal:
  1. **Select file** — Uppy upload button + dropdown of existing `.geojson`/`.json` assets
  2. **Configure** — pick admin area level + GeoJSON property to match on, with preview of values
  3. **Map features** — GeoJSON values (left, monospace) with admin area name dropdown (right). Auto-matched by case-insensitive name comparison. User manually overrides mismatches.
  4. **Confirm and save** — summary + save button

Entry from `instance_data.tsx` via Switch/Match pattern.

### 1.6 Client-side GeoJSON Caching

`client/src/state/caches/geojson_cache.ts`

- IndexedDB via `idb-keyval`, key: `geojson:{level}`
- Version tracked by `uploadedAt` timestamp from `InstanceDetail.geojsonMaps`
- Helper: `getGeoJsonCached(level, uploadedAt)` — check cache → fetch if stale → store → return parsed object

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
4. `client/src/components/slide_deck/slide_editor/index.tsx` — slide figure rendering (2 call sites)
5. `client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts` — AI slide generation

For callers 2-5, when `config.d.type === "map"`, they need to await the GeoJSON cache helper before calling `getFigureInputsFromPresentationObject`. For non-map types, no change in behavior.

**Slides storage:** GeoJSON must NOT be stored in slide `FigureInputs` (same reason styles are stripped — too large, static data). The pattern follows existing `style: undefined` stripping:
- When storing map `FigureInputs` to slides: set `mapData.geoData` to `undefined` (alongside existing `style: undefined`)
- At render time in `convert_slide_to_page_inputs.ts`: inject `geoData` from the IndexedDB cache before passing to panther
- Add `"mapData" in fi` to the valid FigureInputs check in `convert_slide_to_page_inputs.ts` (currently only checks for tableData/chartData/timeseriesData/simpleVizData)

Note: No changes needed to panther. `FigureInputs` already includes `MapInputs` in its union type, and `FigureRenderer` already dispatches to `MapRenderer` via `.isType()` checks.

**New file:** `client/src/generate_visualization/get_data_config_for_map.ts`

- `getMapJsonDataConfigFromPresentationObjectConfig()` — builds panther's `MapJsonDataConfig`:
  - `areaProp`: the admin area column from the disaggregation with `disDisplayOpt: "mapArea"` (e.g., `"admin_area_2"`)
  - `areaMatchProp`: always `"area_id"` (fixed constant — the processed GeoJSON property name)
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

The rendering pipeline sees `type: "map"` and inspects `disaggregateBy` for a `disDisplayOpt: "mapArea"` entry → that determines which level's GeoJSON to load and which column is the `areaProp`. The GeoJSON features are matched via `areaMatchProp: "area_id"` (constant). Other disaggregations become `paneProp`/`tierProp`/`laneProp` for multi-panel map layouts.

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

1. Phase 1 [DONE]
   - Migration + schema + types
   - Server (DB functions, routes, processing logic, combined.ts, main.ts)
   - Client (manager component, upload wizard with Uppy + mapping UI)
   - Caching helper

2. Phase 2 (depends on Phase 1)
   - 2.1 Type changes (PresentationOption, DisaggregationDisplayOption, VIZ_TYPE_CONFIG, config.s fields, translation keys)
   - 2.2 Rendering pipeline (get_figure_inputs + all 5 callers, get_data_config, get_style)
   - 2.3 Additional touchpoints (convert_visualization_type, AI tool, disaggregation editor)
   - 2.4 UI updates (add_visualization, preset_preview, editor)
   - 2.5 Module vizPresets

## Key Files

**Phase 1 (implemented):**

- `server/db/migrations/instance/010_add_geojson_maps.sql`
- `server/db/instance/_main_database.sql`
- `server/db/instance/geojson_maps.ts`
- `server/db/instance/mod.ts`
- `server/db/instance/instance.ts`
- `server/routes/instance/geojson_maps.ts`
- `server/geojson/process_geojson.ts`
- `lib/api-routes/instance/geojson_maps.ts`
- `lib/api-routes/combined.ts`
- `lib/types/geojson_maps.ts`
- `lib/types/instance.ts`
- `lib/types/mod.ts`
- `main.ts`
- `client/src/components/instance_geojson/geojson_manager.tsx`
- `client/src/components/instance_geojson/geojson_upload_wizard.tsx`
- `client/src/components/instance/instance_data.tsx`
- `client/src/state/caches/geojson_cache.ts`

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

- Phase 1: Upload a GeoJSON file for a test country, verify mapping UI works, confirm processed GeoJSON stored in DB with only `area_id` + geometry, verify client cache fetches correctly
- Phase 2: Create a map presentation object from a vizPreset, verify it renders via panther's MapRenderer, test with filtered admin areas, test multi-panel maps
- Typecheck: `deno task typecheck` passes after each phase
