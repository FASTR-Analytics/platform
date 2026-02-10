# AI Tool Testing Instructions

Test every tool listed below. For each tool, run ALL the test cases in order.
Report results in a summary table at the end.

**Important**: Before starting, call `get_available_metrics` and
`get_available_visualizations` to discover real IDs to use in tests. Substitute
real IDs where you see `{REAL_METRIC_ID}`, `{REAL_VIZ_ID}`, etc.

---

## 1. Navigation — `switch_tab`

### Success cases

1. Switch to each valid tab one at a time:
   - `switch_tab({ tab: "decks" })`
   - `switch_tab({ tab: "visualizations" })`
   - `switch_tab({ tab: "metrics" })`
   - `switch_tab({ tab: "modules" })`
   - `switch_tab({ tab: "data" })`
   - `switch_tab({ tab: "settings" })`

### Error cases

2. Invalid tab name:
   - `switch_tab({ tab: "invalid_tab" })`
   - `switch_tab({ tab: "" })`
   - `switch_tab({ tab: "DECKS" })` (case sensitivity)

3. While in editing mode (if currently editing a visualization, slide, or deck):
   - `switch_tab({ tab: "metrics" })` — should fail with "Cannot switch tabs"

4. Missing/wrong input:
   - `switch_tab({})` (missing tab field)
   - `switch_tab({ tab: 123 })` (wrong type)

---

## 2. Metrics — `get_available_metrics`

### Success cases

1. `get_available_metrics({})` — should return list of all metrics

### Error cases

2. `get_available_metrics({ extraField: "test" })` — extra fields (should still
   succeed or be stripped)

---

## 3. Metrics — `get_metric_data`

### Success cases

1. Basic query with just metric ID:
   - `get_metric_data({ metricId: "{REAL_METRIC_ID}" })`

2. Query with disaggregations:
   - `get_metric_data({ metricId: "{REAL_METRIC_ID}", disaggregations: ["year"] })`
   - `get_metric_data({ metricId: "{REAL_METRIC_ID}", disaggregations: ["year", "admin_area_2"] })`

3. Query with filters (use real values discovered from a prior query):
   - `get_metric_data({ metricId: "{REAL_METRIC_ID}", disaggregations: ["year"], filters: [{ col: "year", vals: ["{REAL_YEAR}"] }] })`

4. Query with valid date range (YYYY format):
   - `get_metric_data({ metricId: "{REAL_METRIC_ID}", startDate: 2020, endDate: 2023 })`

5. Query with valid date range (YYYYMM format):
   - `get_metric_data({ metricId: "{REAL_METRIC_ID}", startDate: 202001, endDate: 202312 })`

6. Query with all options combined:
   - `get_metric_data({ metricId: "{REAL_METRIC_ID}", disaggregations: ["year"], filters: [{ col: "year", vals: ["{REAL_YEAR}"] }], startDate: 2020, endDate: 2023 })`

### Error cases

7. Non-existent metric ID:
   - `get_metric_data({ metricId: "nonexistent_metric_xyz" })`

8. Missing metric ID:
   - `get_metric_data({})`

9. Invalid disaggregation name:
   - `get_metric_data({ metricId: "{REAL_METRIC_ID}", disaggregations: ["not_a_real_dimension"] })`

10. Disaggregation not available for this metric (use a dimension that exists
    globally but not for this metric — try `facility_name` or `hfa_indicator`):
    - `get_metric_data({ metricId: "{REAL_METRIC_ID}", disaggregations: ["facility_name"] })`

11. Filter with invalid column:
    - `get_metric_data({ metricId: "{REAL_METRIC_ID}", filters: [{ col: "fake_col", vals: ["x"] }] })`

12. Filter with empty vals array:
    - `get_metric_data({ metricId: "{REAL_METRIC_ID}", filters: [{ col: "year", vals: [] }] })`

13. Filter with non-existent values:
    - `get_metric_data({ metricId: "{REAL_METRIC_ID}", filters: [{ col: "year", vals: ["9999"] }] })`

14. Only startDate without endDate:
    - `get_metric_data({ metricId: "{REAL_METRIC_ID}", startDate: 2020 })`

15. Only endDate without startDate:
    - `get_metric_data({ metricId: "{REAL_METRIC_ID}", endDate: 2023 })`

16. startDate greater than endDate:
    - `get_metric_data({ metricId: "{REAL_METRIC_ID}", startDate: 2025, endDate: 2020 })`

17. Mixed date formats (4-digit and 6-digit):
    - `get_metric_data({ metricId: "{REAL_METRIC_ID}", startDate: 2020, endDate: 202312 })`

18. Invalid YYYYMM — bad month:
    - `get_metric_data({ metricId: "{REAL_METRIC_ID}", startDate: 202013, endDate: 202112 })`

19. Invalid YYYYMM — month 00:
    - `get_metric_data({ metricId: "{REAL_METRIC_ID}", startDate: 202000, endDate: 202112 })`

20. Invalid year range:
    - `get_metric_data({ metricId: "{REAL_METRIC_ID}", startDate: 1800, endDate: 1900 })`

21. Date range outside available data:
    - `get_metric_data({ metricId: "{REAL_METRIC_ID}", startDate: 2090, endDate: 2095 })`

22. Non-numeric dates:
    - `get_metric_data({ metricId: "{REAL_METRIC_ID}", startDate: "2020", endDate: "2023" })`

23. NaN / Infinity dates:
    - `get_metric_data({ metricId: "{REAL_METRIC_ID}", startDate: NaN, endDate: Infinity })`

---

## 4. Modules — `get_available_modules`

### Success cases

1. `get_available_modules({})` — should return module list

---

## 5. Modules — `get_module_r_script`

### Success cases

1. Use a real module ID from the modules list:
   - `get_module_r_script({ id: "{REAL_MODULE_ID}" })`

### Error cases

2. Non-existent module ID:
   - `get_module_r_script({ id: "nonexistent_module_xyz" })`

3. Missing ID:
   - `get_module_r_script({})`

4. Empty string ID:
   - `get_module_r_script({ id: "" })`

---

## 6. Modules — `get_module_log`

### Success cases

1. Use a module that has been run recently:
   - `get_module_log({ id: "{REAL_MODULE_ID}" })`

### Error cases

2. Non-existent module ID:
   - `get_module_log({ id: "nonexistent_module_xyz" })`

3. Module that hasn't been run (no log exists):
   - `get_module_log({ id: "{MODULE_ID_NEVER_RUN}" })`

---

## 7. Visualizations — `get_available_visualizations`

### Success cases

1. `get_available_visualizations({})` — should return visualization list

---

## 8. Visualizations — `get_available_slide_decks`

### Success cases

1. `get_available_slide_decks({})` — should return slide deck list

---

## 9. Visualizations — `get_visualization_data`

### Success cases

1. Use a real visualization ID:
   - `get_visualization_data({ id: "{REAL_VIZ_ID}" })`

### Error cases

2. Non-existent visualization ID:
   - `get_visualization_data({ id: "nonexistent_viz_xyz" })`

3. Missing ID:
   - `get_visualization_data({})`

4. Empty string:
   - `get_visualization_data({ id: "" })`

---

## 10. Visualization Editor — `get_viz_editor`

### Success cases

1. While editing a visualization:
   - `get_viz_editor({})` — should return config, options, and data

### Error cases

2. When NOT editing a visualization (e.g. on metrics tab):
   - `get_viz_editor({})` — should fail with "only available when editing"

---

## 11. Visualization Editor — `update_viz_config`

**Prerequisite**: Navigate to and open a visualization for editing first.

### Success cases

1. Change type:
   - `update_viz_config({ type: "table" })`
   - `update_viz_config({ type: "timeseries" })`
   - `update_viz_config({ type: "chart" })`

2. Update caption/subCaption/footnote:
   - `update_viz_config({ caption: "Test Title", subCaption: "Test Subtitle", footnote: "Test footnote" })`

3. Change period option (use a valid one from `get_viz_editor` results):
   - `update_viz_config({ periodOpt: "{VALID_PERIOD_OPT}" })`

4. Set period filter:
   - `update_viz_config({ periodFilter: { min: {VALID_MIN}, max: {VALID_MAX} } })`

5. Clear period filter:
   - `update_viz_config({ periodFilter: null })`

6. Set values filter (use real value property names from get_viz_editor):
   - `update_viz_config({ valuesFilter: ["{REAL_VALUE_PROP}"] })`

7. Clear values filter:
   - `update_viz_config({ valuesFilter: null })`

8. Add disaggregation (use valid disOpt and disDisplayOpt):
   - `update_viz_config({ disaggregateBy: [{ disOpt: "{VALID_DIS_OPT}", disDisplayOpt: "row" }] })`

9. Add filter:
   - `update_viz_config({ filterBy: [{ disOpt: "{VALID_DIS_OPT}", values: ["{VALID_VALUE}"] }] })`

10. Toggle national data:
    - `update_viz_config({ includeNationalForAdminArea2: true, includeNationalPosition: "top" })`
    - `update_viz_config({ includeNationalForAdminArea2: false })`

11. Set replicant:
    - `update_viz_config({ selectedReplicantValue: "{VALID_REPLICANT}" })`

12. Clear replicant:
    - `update_viz_config({ selectedReplicantValue: null })`

13. Empty update (no fields):
    - `update_viz_config({})` — should return "No changes specified"

### Error cases

14. When NOT editing a visualization:
    - `update_viz_config({ type: "table" })` — should fail with "only available
      when editing"

15. Invalid type:
    - `update_viz_config({ type: "pie_chart" })`

16. Invalid includeNationalPosition:
    - `update_viz_config({ includeNationalPosition: "left" })`

17. Invalid period option:
    - `update_viz_config({ periodOpt: "fake_period_option" })`

18. Invalid display option for current type (e.g. "indicator" for timeseries):
    - `update_viz_config({ valuesDisDisplayOpt: "indicator" })` (when type is
      timeseries)

---

## 12. Slide Deck — `get_deck`

### Success cases

1. While editing a slide deck:
   - `get_deck({})` — should return deck structure

### Error cases

2. When NOT editing a slide deck:
   - `get_deck({})` — should fail with "only available when working with a slide
     deck"

---

## 13. Slide Deck — `get_slide`

**Prerequisite**: Be editing a slide deck. Get deck first to discover slide IDs.

### Success cases

1. Valid slide ID:
   - `get_slide({ slideId: "{REAL_SLIDE_ID}" })`

### Error cases

2. Non-existent slide ID:
   - `get_slide({ slideId: "zzz" })`

3. Empty string:
   - `get_slide({ slideId: "" })`

---

## 14. Slide Deck — `create_slide`

**Prerequisite**: Be editing a slide deck.

### Success cases

1. Create cover slide at end:
   - `create_slide({ position: { toEnd: true }, slide: { type: "cover", title: "Test Cover" } })`

2. Create cover slide with all fields:
   - `create_slide({ position: { toEnd: true }, slide: { type: "cover", title: "Full Cover", subtitle: "A subtitle", presenter: "Test User", date: "2024-01-01" } })`

3. Create section slide:
   - `create_slide({ position: { toEnd: true }, slide: { type: "section", sectionTitle: "Section One" } })`

4. Create section slide with subtitle:
   - `create_slide({ position: { toEnd: true }, slide: { type: "section", sectionTitle: "Section Two", sectionSubtitle: "Details here" } })`

5. Create content slide with text block:
   - `create_slide({ position: { toEnd: true }, slide: { type: "content", header: "Test Slide", blocks: [{ type: "text", markdown: "Hello world" }] } })`

6. Create content slide with from_visualization block:
   - `create_slide({ position: { toEnd: true }, slide: { type: "content", blocks: [{ type: "from_visualization", visualizationId: "{REAL_VIZ_ID}" }] } })`

7. Create content slide with from_metric block:
   - `create_slide({ position: { toEnd: true }, slide: { type: "content", blocks: [{ type: "from_metric", metricId: "{REAL_METRIC_ID}", vizPresetId: "{REAL_PRESET_ID}", chartTitle: "Test Chart" }] } })`

8. Create content slide with max blocks (3):
   - `create_slide({ position: { toEnd: true }, slide: { type: "content", blocks: [{ type: "text", markdown: "Block 1" }, { type: "text", markdown: "Block 2" }, { type: "text", markdown: "Block 3" }] } })`

9. Position variants — after a specific slide:
   - `create_slide({ position: { after: "{REAL_SLIDE_ID}" }, slide: { type: "section", sectionTitle: "After Test" } })`

10. Position variants — before a specific slide:
    - `create_slide({ position: { before: "{REAL_SLIDE_ID}" }, slide: { type: "section", sectionTitle: "Before Test" } })`

11. Position variants — at start:
    - `create_slide({ position: { toStart: true }, slide: { type: "section", sectionTitle: "Start Test" } })`

12. Content slide with no header:
    - `create_slide({ position: { toEnd: true }, slide: { type: "content", blocks: [{ type: "text", markdown: "No header" }] } })`

### Error cases

13. When NOT editing a slide deck:
    - `create_slide({ position: { toEnd: true }, slide: { type: "cover", title: "Fail" } })`

14. When editing a single slide (editing_slide mode):
    - `create_slide({ position: { toEnd: true }, slide: { type: "cover", title: "Fail" } })`
    — should say "Close the slide editor first"

15. Too many blocks (4+):
    - `create_slide({ position: { toEnd: true }, slide: { type: "content", blocks: [{ type: "text", markdown: "1" }, { type: "text", markdown: "2" }, { type: "text", markdown: "3" }, { type: "text", markdown: "4" }] } })`

16. Markdown table in text block:
    - `create_slide({ position: { toEnd: true }, slide: { type: "content", blocks: [{ type: "text", markdown: "| Col1 | Col2 |\n| --- | --- |\n| A | B |" }] } })`

17. Text block exceeding 5000 chars:
    - `create_slide({ position: { toEnd: true }, slide: { type: "content", blocks: [{ type: "text", markdown: "x".repeat(5001) }] } })`

18. Empty blocks array:
    - `create_slide({ position: { toEnd: true }, slide: { type: "content", blocks: [] } })`

19. Missing required title on cover slide:
    - `create_slide({ position: { toEnd: true }, slide: { type: "cover" } })`

20. Missing required sectionTitle on section slide:
    - `create_slide({ position: { toEnd: true }, slide: { type: "section" } })`

21. Non-existent visualization ID in from_visualization block:
    - `create_slide({ position: { toEnd: true }, slide: { type: "content", blocks: [{ type: "from_visualization", visualizationId: "nonexistent_viz" }] } })`

22. Non-existent metric ID in from_metric block:
    - `create_slide({ position: { toEnd: true }, slide: { type: "content", blocks: [{ type: "from_metric", metricId: "fake_metric", vizPresetId: "fake_preset", chartTitle: "Fail" }] } })`

23. Non-existent preset ID in from_metric block:
    - `create_slide({ position: { toEnd: true }, slide: { type: "content", blocks: [{ type: "from_metric", metricId: "{REAL_METRIC_ID}", vizPresetId: "fake_preset", chartTitle: "Fail" }] } })`

24. Cover title exceeding 200 chars:
    - `create_slide({ position: { toEnd: true }, slide: { type: "cover", title: "x".repeat(201) } })`

25. Section title empty string:
    - `create_slide({ position: { toEnd: true }, slide: { type: "section", sectionTitle: "" } })`

26. Position referencing non-existent slide:
    - `create_slide({ position: { after: "zzz" }, slide: { type: "cover", title: "Test" } })`

27. Invalid slide type:
    - `create_slide({ position: { toEnd: true }, slide: { type: "invalid_type", title: "Fail" } })`

---

## 15. Slide Deck — `replace_slide`

**Prerequisite**: Be editing a slide deck with existing slides.

### Success cases

1. Replace with cover slide:
   - `replace_slide({ slideId: "{REAL_SLIDE_ID}", slide: { type: "cover", title: "Replaced Cover" } })`

2. Replace with section slide:
   - `replace_slide({ slideId: "{REAL_SLIDE_ID}", slide: { type: "section", sectionTitle: "Replaced Section" } })`

3. Replace with content slide:
   - `replace_slide({ slideId: "{REAL_SLIDE_ID}", slide: { type: "content", blocks: [{ type: "text", markdown: "Replaced content" }] } })`

### Error cases

4. Non-existent slide ID:
   - `replace_slide({ slideId: "zzz", slide: { type: "cover", title: "Fail" } })`

5. Markdown table in replacement:
   - `replace_slide({ slideId: "{REAL_SLIDE_ID}", slide: { type: "content", blocks: [{ type: "text", markdown: "| A | B |\n|---|---|\n| 1 | 2 |" }] } })`

6. Too many blocks:
   - `replace_slide({ slideId: "{REAL_SLIDE_ID}", slide: { type: "content", blocks: [{ type: "text", markdown: "1" }, { type: "text", markdown: "2" }, { type: "text", markdown: "3" }, { type: "text", markdown: "4" }] } })`

---

## 16. Slide Deck — `update_slide_content`

**Prerequisite**: Be editing a slide deck. Use `get_slide` to discover block IDs.

### Success cases

1. Update single text block:
   - `update_slide_content({ slideId: "{REAL_SLIDE_ID}", updates: [{ blockId: "{REAL_BLOCK_ID}", newContent: { type: "text", markdown: "Updated text" } }] })`

2. Update multiple blocks at once:
   - `update_slide_content({ slideId: "{REAL_SLIDE_ID}", updates: [{ blockId: "{BLOCK_ID_1}", newContent: { type: "text", markdown: "Updated 1" } }, { blockId: "{BLOCK_ID_2}", newContent: { type: "text", markdown: "Updated 2" } }] })`

3. Replace text block with visualization block:
   - `update_slide_content({ slideId: "{REAL_SLIDE_ID}", updates: [{ blockId: "{REAL_BLOCK_ID}", newContent: { type: "from_visualization", visualizationId: "{REAL_VIZ_ID}" } }] })`

### Error cases

4. Non-existent block ID:
   - `update_slide_content({ slideId: "{REAL_SLIDE_ID}", updates: [{ blockId: "zzz", newContent: { type: "text", markdown: "Fail" } }] })`

5. Non-existent slide ID:
   - `update_slide_content({ slideId: "zzz", updates: [{ blockId: "abc", newContent: { type: "text", markdown: "Fail" } }] })`

6. Empty updates array:
   - `update_slide_content({ slideId: "{REAL_SLIDE_ID}", updates: [] })`

7. Markdown table in update:
   - `update_slide_content({ slideId: "{REAL_SLIDE_ID}", updates: [{ blockId: "{REAL_BLOCK_ID}", newContent: { type: "text", markdown: "| A | B |\n|---|---|\n| 1 | 2 |" } }] })`

---

## 17. Slide Deck — `update_slide_header`

**Prerequisite**: Be editing a slide deck with a content slide.

### Success cases

1. Update header:
   - `update_slide_header({ slideId: "{CONTENT_SLIDE_ID}", newHeader: "New Header Text" })`

2. Set header to empty string:
   - `update_slide_header({ slideId: "{CONTENT_SLIDE_ID}", newHeader: "" })`

### Error cases

3. Non-existent slide ID:
   - `update_slide_header({ slideId: "zzz", newHeader: "Fail" })`

4. On a cover slide (not content):
   - `update_slide_header({ slideId: "{COVER_SLIDE_ID}", newHeader: "Fail" })`
   — should fail with "Cannot update header on cover slide"

5. On a section slide:
   - `update_slide_header({ slideId: "{SECTION_SLIDE_ID}", newHeader: "Fail" })`
   — should fail with "Cannot update header on section slide"

---

## 18. Slide Deck — `delete_slides`

**Prerequisite**: Be editing a slide deck. Create some test slides first.

### Success cases

1. Delete single slide:
   - `delete_slides({ slideIds: ["{TEST_SLIDE_ID}"] })`

2. Delete multiple slides:
   - `delete_slides({ slideIds: ["{TEST_SLIDE_ID_1}", "{TEST_SLIDE_ID_2}"] })`

### Error cases

3. Non-existent slide IDs:
   - `delete_slides({ slideIds: ["zzz", "yyy"] })`

4. Empty array:
   - `delete_slides({ slideIds: [] })`

5. When not editing deck:
   - `delete_slides({ slideIds: ["{REAL_SLIDE_ID}"] })`

---

## 19. Slide Deck — `duplicate_slides`

### Success cases

1. Duplicate single slide:
   - `duplicate_slides({ slideIds: ["{REAL_SLIDE_ID}"] })`

2. Duplicate multiple slides:
   - `duplicate_slides({ slideIds: ["{SLIDE_1}", "{SLIDE_2}"] })`

### Error cases

3. Non-existent slide IDs:
   - `duplicate_slides({ slideIds: ["zzz"] })`

4. Empty array:
   - `duplicate_slides({ slideIds: [] })`

---

## 20. Slide Deck — `move_slides`

### Success cases

1. Move to end:
   - `move_slides({ slideIds: ["{REAL_SLIDE_ID}"], position: { toEnd: true } })`

2. Move to start:
   - `move_slides({ slideIds: ["{REAL_SLIDE_ID}"], position: { toStart: true } })`

3. Move after specific slide:
   - `move_slides({ slideIds: ["{SLIDE_A}"], position: { after: "{SLIDE_B}" } })`

4. Move before specific slide:
   - `move_slides({ slideIds: ["{SLIDE_A}"], position: { before: "{SLIDE_B}" } })`

5. Move multiple slides:
   - `move_slides({ slideIds: ["{SLIDE_A}", "{SLIDE_B}"], position: { toEnd: true } })`

### Error cases

6. Non-existent slide in slideIds:
   - `move_slides({ slideIds: ["zzz"], position: { toEnd: true } })`

7. Non-existent target in position:
   - `move_slides({ slideIds: ["{REAL_SLIDE_ID}"], position: { after: "zzz" } })`

8. Empty slideIds:
   - `move_slides({ slideIds: [], position: { toEnd: true } })`

9. Move slide relative to itself:
   - `move_slides({ slideIds: ["{SLIDE_A}"], position: { after: "{SLIDE_A}" } })`

---

## 21. Slide Editor — `get_slide_editor`

### Success cases

1. While editing a single slide:
   - `get_slide_editor({})` — should return slide content

### Error cases

2. When NOT editing a slide:
   - `get_slide_editor({})` — should fail with "only available when editing a
     slide"

---

## 22. Slide Editor — `update_slide_editor`

**Prerequisite**: Be editing a single slide.

### Success cases (cover slide)

1. Update title:
   - `update_slide_editor({ title: "Updated Title" })`

2. Update all cover fields:
   - `update_slide_editor({ title: "New Title", subtitle: "New Sub", presenter: "Name", date: "2024-06" })`

### Success cases (section slide)

3. Update section title:
   - `update_slide_editor({ sectionTitle: "Updated Section" })`

4. Update both fields:
   - `update_slide_editor({ sectionTitle: "Updated", sectionSubtitle: "New subtitle" })`

### Success cases (content slide)

5. Update header:
   - `update_slide_editor({ header: "Updated Header" })`

6. Update block content:
   - `update_slide_editor({ blockUpdates: [{ blockId: "{REAL_BLOCK_ID}", newContent: { type: "text", markdown: "Updated via editor" } }] })`

7. Update header and blocks together:
   - `update_slide_editor({ header: "New Header", blockUpdates: [{ blockId: "{REAL_BLOCK_ID}", newContent: { type: "text", markdown: "Also updated" } }] })`

### Error cases

8. When NOT editing a slide:
   - `update_slide_editor({ title: "Fail" })` — should fail

9. Wrong fields for slide type (e.g. title on content slide):
   - `update_slide_editor({ title: "Fail" })` (on content slide) — should
     return "No changes specified"

10. Wrong fields for slide type (e.g. sectionTitle on cover slide):
    - `update_slide_editor({ sectionTitle: "Fail" })` (on cover slide) — should
      return "No changes specified"

11. Empty update:
    - `update_slide_editor({})` — should return "No changes specified"

12. Markdown table in block update:
    - `update_slide_editor({ blockUpdates: [{ blockId: "{REAL_BLOCK_ID}", newContent: { type: "text", markdown: "| A | B |\n|---|---|\n| 1 | 2 |" } }] })`

13. Non-existent block ID:
    - `update_slide_editor({ blockUpdates: [{ blockId: "zzz", newContent: { type: "text", markdown: "Fail" } }] })`

---

## 23. Drafts — `show_draft_visualization_to_user`

### Success cases

1. From existing visualization:
   - `show_draft_visualization_to_user({ title: "Test Draft", figure: { type: "from_visualization", visualizationId: "{REAL_VIZ_ID}" } })`

2. From visualization with replicant:
   - `show_draft_visualization_to_user({ title: "Draft with Replicant", figure: { type: "from_visualization", visualizationId: "{REAL_VIZ_ID}", replicant: "{VALID_REPLICANT}" } })`

3. From metric:
   - `show_draft_visualization_to_user({ title: "Metric Draft", figure: { type: "from_metric", metricId: "{REAL_METRIC_ID}", vizPresetId: "{REAL_PRESET_ID}", chartTitle: "Test Chart" } })`

4. From metric with all options:
   - `show_draft_visualization_to_user({ title: "Full Metric Draft", figure: { type: "from_metric", metricId: "{REAL_METRIC_ID}", vizPresetId: "{REAL_PRESET_ID}", chartTitle: "Full Chart", filterOverrides: [{ col: "{VALID_COL}", vals: ["{VALID_VAL}"] }], startDate: 2020, endDate: 2023 } })`

### Error cases

5. Non-existent visualization ID:
   - `show_draft_visualization_to_user({ title: "Fail", figure: { type: "from_visualization", visualizationId: "nonexistent" } })`

6. Non-existent metric ID:
   - `show_draft_visualization_to_user({ title: "Fail", figure: { type: "from_metric", metricId: "fake", vizPresetId: "fake", chartTitle: "Fail" } })`

7. Non-existent preset ID:
   - `show_draft_visualization_to_user({ title: "Fail", figure: { type: "from_metric", metricId: "{REAL_METRIC_ID}", vizPresetId: "nonexistent_preset", chartTitle: "Fail" } })`

8. Title exceeding 200 chars:
   - `show_draft_visualization_to_user({ title: "x".repeat(201), figure: { type: "from_visualization", visualizationId: "{REAL_VIZ_ID}" } })`

9. Missing title:
   - `show_draft_visualization_to_user({ figure: { type: "from_visualization", visualizationId: "{REAL_VIZ_ID}" } })`

10. Missing figure:
    - `show_draft_visualization_to_user({ title: "No Figure" })`

11. Invalid figure type:
    - `show_draft_visualization_to_user({ title: "Fail", figure: { type: "from_nothing" } })`

---

## 24. Drafts — `show_draft_slide_to_user`

### Success cases

1. Cover slide:
   - `show_draft_slide_to_user({ slide: { type: "cover", title: "Draft Cover" } })`

2. Cover slide with all fields:
   - `show_draft_slide_to_user({ slide: { type: "cover", title: "Full Cover", subtitle: "Sub", presenter: "Name", date: "2024" } })`

3. Section slide:
   - `show_draft_slide_to_user({ slide: { type: "section", sectionTitle: "Draft Section" } })`

4. Content slide with text:
   - `show_draft_slide_to_user({ slide: { type: "content", header: "Draft Content", blocks: [{ type: "text", markdown: "Hello from draft" }] } })`

5. Content slide with visualization:
   - `show_draft_slide_to_user({ slide: { type: "content", blocks: [{ type: "from_visualization", visualizationId: "{REAL_VIZ_ID}" }] } })`

6. Content slide with metric:
   - `show_draft_slide_to_user({ slide: { type: "content", blocks: [{ type: "from_metric", metricId: "{REAL_METRIC_ID}", vizPresetId: "{REAL_PRESET_ID}", chartTitle: "Draft Metric" }] } })`

7. Content slide with mixed blocks (text + visualization):
   - `show_draft_slide_to_user({ slide: { type: "content", blocks: [{ type: "text", markdown: "Analysis below:" }, { type: "from_visualization", visualizationId: "{REAL_VIZ_ID}" }] } })`

8. Content slide with max blocks (3):
   - `show_draft_slide_to_user({ slide: { type: "content", blocks: [{ type: "text", markdown: "One" }, { type: "text", markdown: "Two" }, { type: "text", markdown: "Three" }] } })`

### Error cases

9. Too many blocks (4+):
   - `show_draft_slide_to_user({ slide: { type: "content", blocks: [{ type: "text", markdown: "1" }, { type: "text", markdown: "2" }, { type: "text", markdown: "3" }, { type: "text", markdown: "4" }] } })`

10. Markdown table:
    - `show_draft_slide_to_user({ slide: { type: "content", blocks: [{ type: "text", markdown: "| A | B |\n|---|---|\n| 1 | 2 |" }] } })`

11. Non-existent visualization in block:
    - `show_draft_slide_to_user({ slide: { type: "content", blocks: [{ type: "from_visualization", visualizationId: "nonexistent" }] } })`

12. Non-existent metric in block:
    - `show_draft_slide_to_user({ slide: { type: "content", blocks: [{ type: "from_metric", metricId: "fake", vizPresetId: "fake", chartTitle: "Fail" }] } })`

13. Missing slide:
    - `show_draft_slide_to_user({})`

14. Invalid slide type:
    - `show_draft_slide_to_user({ slide: { type: "invalid" } })`

---

## 25. Methodology Docs — `get_methodology_docs_list`

### Success cases

1. `get_methodology_docs_list({})` — should return table of contents

### Error cases

2. (Unlikely to fail unless GitHub API is down — test for network resilience)

---

## 26. Methodology Docs — `get_methodology_doc_content`

### Success cases

1. English doc:
   - `get_methodology_doc_content({ fileName: "introduction.md" })`

2. French doc:
   - `get_methodology_doc_content({ fileName: "fr/introduction.md" })`

### Error cases

3. Non-existent file:
   - `get_methodology_doc_content({ fileName: "nonexistent_file.md" })`

4. Missing fileName:
   - `get_methodology_doc_content({})`

5. Empty string:
   - `get_methodology_doc_content({ fileName: "" })`

6. Path traversal attempt:
   - `get_methodology_doc_content({ fileName: "../../secrets.md" })`

---

## Test Execution Order

Run tests in this recommended order to manage state correctly:

1. **Phase 1 — No editing required**: Tests 1-9, 25-26 (navigation, metrics,
   modules, visualizations, methodology docs)
2. **Phase 2 — Visualization editing**: Tests 10-11 (open a visualization for
   editing first)
3. **Phase 3 — Slide deck editing**: Tests 12-20 (open a slide deck for editing
   first)
4. **Phase 4 — Single slide editing**: Tests 21-22 (open a single slide for
   editing)
5. **Phase 5 — Drafts (any mode)**: Tests 23-24
6. **Phase 6 — Cross-mode errors**: Re-run mode-restricted tools from wrong
   modes

## Results Template

After running all tests, fill in:

| # | Tool | Test | Expected | Actual | Pass/Fail |
|---|------|------|----------|--------|-----------|
| 1 | switch_tab | Valid tab "decks" | Success | | |
| 2 | switch_tab | Invalid tab | Schema error | | |
| ... | ... | ... | ... | ... | ... |

Report any unexpected behaviors, missing error messages, or crashes.
