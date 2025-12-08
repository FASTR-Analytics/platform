# Task Actions - Actionable Plans

These are tasks from the task tracker that I can address without further direction.

---

## PLAN-001: DQA Parameter Label Update (Row 42)

**Task:** Change DQA parameter text from "Desired geographic level (district) for grouping when adjusting outliers" to "Desired geographic level for running the consistency analysis"

**Feasibility:** Quick

**Files to modify:**
- `module_defs/m001/1.0.0/definition.ts` line 298-299

**Implementation:**
1. Change the `description` field for the `GEOLEVEL` parameter from:
   ```
   "Admin level used to join facilities to corresponding geo-consistency"
   ```
   to:
   ```
   "Desired geographic level for running the consistency analysis"
   ```
2. Run `deno task build:modules` to regenerate module metadata

---

## PLAN-002: Generic Legend Wording for Period-to-Period Charts (Row 121)

**Task:** Make the legend for red/green percent change charts generic so it works for monthly, quarterly, or yearly views (currently says ">10% quarter-to-quarter")

**Feasibility:** Quick

**Files to modify:**
- `lib/translate/FRENCH_UI_STRINGS.xlsx` (source) or generated translation files
- `client/src/generate_visualization/conditional_formatting.ts` lines 104-120 (if hardcoded)

**Implementation:**
1. Locate translation keys `greater_than_10_quartertoquart` and `greater_than_10_quartertoquart_1`
2. Change from "Greater than 10% quarter-to-quarter increase/decrease" to:
   - Option A: ">10% increase" / ">10% decrease" (simplest)
   - Option B: ">10% period-to-period increase/decrease" (maintains context)
3. Update both English and French translations
4. Run `deno task build:translations`

---

## PLAN-003: Add "Last X Months" Period Filter (Row 131)

**Task:** Add "last 6 months" (or configurable "last X months") as a custom period filter option

**Feasibility:** Medium

**Files to modify:**
- `lib/types/presentation_objects.ts` line 64 - extend `PeriodFilter.filterType`
- `client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx` - add UI option
- `server/server_only_funcs_presentation_objects/get_presentation_object_items.ts` - handle new filter in SQL

**Implementation:**
1. Add `"last_6_months"` (or `"last_x_months"` with a numeric parameter) to the `filterType` union type
2. Add UI control (dropdown option or number input)
3. Implement period calculation in the server query builder:
   - Calculate current period
   - Subtract X months to get min bound
   - Apply to WHERE clause

---

## PLAN-004: Validate National Not Allowed for Disaggregated-Only Results (Row 130)

**Task:** Don't allow adding "National" as a row if the ResultsValue is designed to be ONLY disaggregated at non-National level

**Feasibility:** Medium

**Files to modify:**
- `lib/types/module_definitions.ts` - add flag to ResultsValue type
- `client/src/components/visualization/presentation_object_editor_panel_data/_3_disaggregation.tsx` - disable "Include National" checkbox conditionally
- Module definitions that need this restriction

**Implementation:**
1. Add `disallowNational?: boolean` to `ResultsValue` type
2. In disaggregation UI, check if current ResultsValue has this flag
3. If true, hide or disable the "Include national results" checkbox
4. Update relevant module definitions to set this flag

---

## PLAN-005: Add Slide Hidden/Exclude from Export (Row 66)

**Task:** Allow hiding a slide so it doesn't appear in the exported PDF

**Feasibility:** Medium

**Files to modify:**
- `lib/types/reports.ts` - add `hiddenFromExport?: boolean` to `ReportItemBase`
- `server/db/project/reports.ts` - handle in CRUD
- `client/src/components/report/report_item_editor_panel.tsx` - add toggle in UI
- `client/src/export_report/export_report_as_pdf_vector.ts` - skip hidden items
- `client/src/export_report/export_report_as_pptx_with_images.ts` - skip hidden items

**Implementation:**
1. Add `hiddenFromExport?: boolean` property to report item types
2. Add checkbox in report item editor panel
3. In export functions, filter out items where `hiddenFromExport === true`
4. Optionally add visual indicator in UI (dimmed/greyed slide thumbnail)

---

## PLAN-006: Text Justification in Reports (Row 52)

**Task:** Add text justification options (left, right, center) for text in reports

**Feasibility:** Medium

**Files to modify:**
- `lib/types/reports.ts` - add `textAlign?: "left" | "center" | "right"` to text item config
- `client/src/components/report/report_item_editor_panel_content.tsx` - add alignment controls
- `client/src/generate_report/get_rows_for_freeform.ts` - pass alignment to panther
- Check if panther's markdown/text rendering supports alignment

**Implementation:**
1. Add `textAlign` property to `ReportItemContentItemText`
2. Add radio buttons or dropdown in content editor (Left/Center/Right)
3. Pass alignment through to `ADTParagraphStyleOptions` in panther
4. Default to "left" for backwards compatibility

---

## PLAN-007: Include National in Replicants Automatically (Row 126)

**Task:** When creating replicants by admin area, always include the national chart in the list

**Feasibility:** Medium

**Files to modify:**
- `server/server_only_funcs_presentation_objects/get_possible_values.ts` - add "National" option
- `client/src/components/ReplicateByOptions.tsx` - ensure National appears first

**Implementation:**
1. When fetching replicant options for admin_area_2/3/4, prepend "National" to the list
2. Ensure the National option triggers the `includeNationalForAdminArea2` logic
3. This may require special handling since National isn't a real admin area value

---

## PLAN-008: Cascading Admin Area Filters (Rows 77-79, 141)

**Task:** When selecting admin2 in filters, restrict admin3/admin4 dropdown lists to only show areas within the selected admin2

**Feasibility:** Medium

**Files to modify:**
- `client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx`
- `server/server_only_funcs_presentation_objects/get_results_value_info.ts` - may need hierarchy data

**Implementation:**
1. Store admin hierarchy relationship (admin3 belongs to admin2, etc.)
2. When admin2 filter changes, filter the admin3/admin4 option lists
3. This requires either:
   - Loading hierarchy data with results value info
   - Separate API call to fetch child admin areas
   - Client-side filtering if hierarchy is already available

---

## PLAN-009: Search in Filter Dropdowns (Row 91)

**Task:** Add search/filter functionality to LGA and other long dropdown lists

**Feasibility:** Medium

**Files to modify:**
- `client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx`
- May need to replace or enhance the multi-select component

**Implementation:**
1. Add text input field above dropdown options
2. Filter options as user types
3. Consider using a searchable select component from panther or adding one
4. Apply to admin_area_3, admin_area_4, and facility dropdowns specifically

---

## PLAN-010: Data Labels on Line Charts Toggle (Row 148)

**Task:** Add option to turn on data labels on line graphs (numbers above each point)

**Feasibility:** Quick

**Files to modify:**
- Already exists! `config.s.showDataLabelsLineCharts` in `lib/types/presentation_objects.ts`
- Verify it's exposed in UI: `client/src/components/visualization/presentation_object_editor_panel_style.tsx`

**Implementation:**
1. Check if `showDataLabelsLineCharts` is exposed in the style panel
2. If not, add checkbox for "Show data labels on line charts"
3. The backend logic already exists in `get_style_from_po.ts`

---

## PLAN-011: Bold for Dates and Footnotes (Row 146)

**Task:** Allow making dates and footnotes bold in visualizations

**Feasibility:** Medium

**Files to modify:**
- `lib/types/presentation_objects.ts` - add `footnoteBold?: boolean`, `dateBold?: boolean` to style config
- `client/src/components/visualization/presentation_object_editor_panel_text.tsx` - add bold toggles
- `client/src/generate_visualization/get_style_from_po.ts` - pass bold setting to panther

**Implementation:**
1. Add boolean flags for bold text options in config.t or config.s
2. Add checkboxes in text/style panel
3. Map to panther's text style options (fontWeight)

---

## PLAN-012: Y-Axis Label Size (Row 147)

**Task:** Allow expanding/adjusting the size of y-axis labels/indicators

**Feasibility:** Medium

**Files to modify:**
- `lib/types/presentation_objects.ts` - add `yAxisLabelSize?: number` to style config
- `client/src/components/visualization/presentation_object_editor_panel_style.tsx` - add size control
- `client/src/generate_visualization/get_style_from_po.ts` - pass to panther style

**Implementation:**
1. Add `yAxisLabelRelFontSize` property (relative multiplier like caption has)
2. Add slider or number input in style panel
3. Pass through to panther's y-axis text style configuration

---

## Notes

Tasks marked with plans above are ones where the implementation path is clear. Other tasks in the tracker require:
- More context from users (what exactly they want)
- Architectural decisions (multiple valid approaches)
- External dependencies (Clerk email issues, DHIS2 integration)
- Major new features (maps, dashboards, predictive analytics)
