# Code Review Issues

This document tracks code quality issues found during comprehensive review.

## Issues

### Root Level Files

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/main.ts:30-112`
- **Type**: function-placement
- **Severity**: medium
- **Description**: Main execution code starts at line 30. The file has no clear entrypoint function at the top. All initialization and server setup code runs at module level. User preference is to have the main/entrypoint function at the top of the file.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/main.ts:57-59`
- **Type**: commented-code
- **Severity**: low
- **Description**: Contains `//@ts-ignore` with comment "Clerk middleware types not fully compatible with Hono" followed by comment "LOCAL_DEVELOPMENT_TOGGLE". The ts-ignore directive is a code smell that could be resolved with proper typing. The LOCAL_DEVELOPMENT_TOGGLE comment suggests this line may need to be toggled during development.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/build_module_definitions.ts:234-307`
- **Type**: function-placement
- **Severity**: medium
- **Description**: Main function `buildModules()` is defined at line 234, but the file has no clear entrypoint at the top. The actual execution happens at line 305-307 with `if (import.meta.main)`. User preference is to have entrypoint function at the top.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/build_module_definitions.ts:208`
- **Type**: other
- **Severity**: low
- **Description**: Generated warning comment `// ⚠️  THIS FILE IS AUTO-GENERATED - DO NOT EDIT MANUALLY` is part of template string. This is acceptable but the warning emoji may not align with user preference to avoid emojis unless requested.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/build_translations.ts:7-61`
- **Type**: function-placement
- **Severity**: high
- **Description**: No main/entrypoint function. All code executes at module level starting from line 7. This is poor structure for a build script. Should have a main function at the top that orchestrates the build process.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/deploy:168`
- **Type**: other
- **Severity**: low
- **Description**: Backtick-style command substitution `today=\`date +%Y_%m_%d_%H_%M_%S\`` is legacy syntax. Modern shell scripts should use `today=$(date +%Y_%m_%d_%H_%M_%S)` instead for better readability and nesting support.

---

### Client Directory

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/server_actions/_internal/create-server-action-v2.ts:1`
- **Type**: naming
- **Severity**: medium
- **Description**: File uses "v2" suffix indicating versioning in filename. Should use descriptive name without version suffixes.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/server_actions/_internal/create-all-server-actions-v2.ts:1`
- **Type**: naming
- **Severity**: medium
- **Description**: File uses "v2" suffix indicating versioning in filename. Should use descriptive name without version suffixes.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/server_actions/_internal/create-server-action-v2.ts:86`
- **Type**: naming
- **Severity**: medium
- **Description**: Function named `createServerActionV2` with version suffix. Should have descriptive name like `createStreamingServerAction` or similar.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/server_actions/_internal/create-all-server-actions-v2.ts:6`
- **Type**: naming
- **Severity**: medium
- **Description**: Function named `createAllServerActionsV2` with version suffix. Should have descriptive name.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/server_actions/example-streaming-usage.ts:6`
- **Type**: naming
- **Severity**: low
- **Description**: Variable named `serverActionsV2` with version suffix.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/components/project_chatbot_v2/index.tsx:1`
- **Type**: naming
- **Severity**: medium
- **Description**: Directory and component named with "v2" suffix. Should use descriptive naming without version numbers.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/components/project_chatbot_v2/index.tsx:27`
- **Type**: naming
- **Severity**: medium
- **Description**: Component named `ProjectChatbotV2` with version suffix.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/components/project/index.tsx:34`
- **Type**: naming
- **Severity**: low
- **Description**: Import alias uses "V2" in name: `ProjectChatbotV2 as ProjectChatbot`.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/export_report/export_report_as_pdf_vector.ts:14`
- **Type**: commented-code
- **Severity**: low
- **Description**: Commented import: `// import { PdfRenderContext } from "./pdf_render_context";`. Should be removed if not needed.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/components/project/index.tsx:21-22`
- **Type**: commented-code
- **Severity**: low
- **Description**: Commented imports that should be removed if not needed.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/generate_visualization/conditional_formatting_scorecard.ts:1`
- **Type**: commented-code
- **Severity**: low
- **Description**: Commented line: `// export const _SCORECARD = {` - incomplete comment that should be removed.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/state/caches/_archived/TimCacheB_in_memory_only.ts:1-30`
- **Type**: commented-code
- **Severity**: low
- **Description**: Archived file with documentation header. This is acceptable as it's intentionally archived with clear documentation explaining why.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/state/caches/_archived/TimCacheD_indexeddb.ts:1`
- **Type**: commented-code
- **Severity**: low
- **Description**: Archived file. Acceptable as it's in _archived directory with proper documentation.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/components/PresentationObjectMiniDisplay.tsx:17`
- **Type**: function-placement
- **Severity**: medium
- **Description**: Main exported function `PresentationObjectMiniDisplay` is at top (correct), but helper function `PresentationObjectMiniDisplayStateHolderWrapper` at line 69 is defined below but is also exported (line 86), suggesting it should be moved to top.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/components/LoggedInWrapper.tsx:39`
- **Type**: function-placement
- **Severity**: medium
- **Description**: Main exported function `LoggedInWrapper` is at top (correct), but helper function `ClerkNewLogin` at line 119 is defined below the main component. Helper functions should be defined after main exports (this is acceptable per user's preference).

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/components/visualization/index.tsx:69-118`
- **Type**: function-placement
- **Severity**: medium
- **Description**: Main exported function `Visualization` is at line 69. Inner implementation function `PresentationObjectEditorInner` is at line 118. The exported entry point should be at the top of the file.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx:42`
- **Type**: function-placement
- **Severity**: medium
- **Description**: Main exported function `Filters` is at line 42, but there are helper functions defined below (lines 112, 168, 282, 376, 448). Main export should be at top.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/state/ri_cache.ts:170`
- **Type**: other
- **Severity**: low
- **Description**: Comment says "NEW REACTIVE CACHE" which is temporal language that should be removed once the pattern is established.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/state/caches/reports.ts:80`
- **Type**: other
- **Severity**: low
- **Description**: Comment says "NEW REACTIVE SYSTEM (Proof-of-Concept)" which is temporal language that should be updated or removed.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/components/project/project_data.tsx:313`
- **Type**: other
- **Severity**: medium
- **Description**: TODO comment: "TODO: Need to figure out how to handle this" with hardcoded value `999999`.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/components/instance_dataset_hmis_import/step_2_dhis2.tsx:110`
- **Type**: other
- **Severity**: medium
- **Description**: TODO comment: "TODO: Replace with actual server action when available".

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/components/report/report_item_editor_panel_content.tsx:68`
- **Type**: other
- **Severity**: medium
- **Description**: TODO comment: "TODO - add something here that asks the user to select their replicant".

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/state/po_cache.ts:20-31`
- **Type**: other
- **Severity**: low
- **Description**: Large ASCII art comment banner. While decorative, may be excessive. User preference unclear.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/state/po_cache.ts:227`
- **Type**: other
- **Severity**: low
- **Description**: Typo in function name: `getPODetailFromCacheorFetch_AsyncGenderator` - "Genderator" should be "Generator".

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/client/src/state/po_cache.ts:283`
- **Type**: other
- **Severity**: low
- **Description**: Typo in function name: `getPODetailFromCacheorFetch` - inconsistent casing "or" should be "Or".

---

### Server Directory

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/dhis2/goal1_org_units_v2/mod.ts`
- **Type**: naming
- **Severity**: medium
- **Description**: Directory named `goal1_org_units_v2` contains "v2" suffix indicating versioning in directory name rather than proper versioning strategy

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/dhis2/goal1_org_units_v2/connection.ts`
- **Type**: naming
- **Severity**: medium
- **Description**: Part of `goal1_org_units_v2` directory with legacy versioning pattern

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/dhis2/goal1_org_units_v2/get_metadata.ts`
- **Type**: naming
- **Severity**: medium
- **Description**: Part of `goal1_org_units_v2` directory with legacy versioning pattern

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/dhis2/goal1_org_units_v2/stream_org_units.ts`
- **Type**: naming
- **Severity**: medium
- **Description**: Part of `goal1_org_units_v2` directory with legacy versioning pattern

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/dhis2/goal1_org_units_v2/types.ts`
- **Type**: naming
- **Severity**: medium
- **Description**: Part of `goal1_org_units_v2` directory with legacy versioning pattern

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/server_only_funcs_presentation_objects/get_combined_query.ts`
- **Type**: naming
- **Severity**: medium
- **Description**: References "v2" functions internally (buildCombinedQueryV2, buildMainQuery, etc.) indicating mixed versioning strategy

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/server_only_funcs_importing/stage_structure_from_dhis2.ts`
- **Type**: naming
- **Severity**: low
- **Description**: Function references `stageStructureFromDhis2V2` internally indicating versioned function naming

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/routes/caches/structure.ts`
- **Type**: naming
- **Severity**: low
- **Description**: References v2 functions indicating mixed versioning

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/routes/instance/structure.ts`
- **Type**: naming
- **Severity**: low
- **Description**: Uses v2 dhis2 module imports and functions

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/db/instance/structure.ts:29-39`
- **Type**: function-placement
- **Severity**: medium
- **Description**: Helper functions `getRawUA` and `getRawUAOrThrow` at top before main public function `getStructureItems` at line 60

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/db/instance/structure.ts:427-443`
- **Type**: function-placement
- **Severity**: medium
- **Description**: Helper functions `handleStagingSuccess` and `handleStagingError` placed in middle of file between public functions instead of at end

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/db/instance/dataset_hmis.ts:47-57`
- **Type**: function-placement
- **Severity**: medium
- **Description**: Helper functions `getRawUA` and `getRawUAOrThrow` at top before main public function `getDatasetHmisDetail` at line 80

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/db/instance/dataset_hmis.ts:359-435`
- **Type**: function-placement
- **Severity**: medium
- **Description**: Helper function `getDatasetHmisItemsForDisplayRaw` placed between public functions instead of at end

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/server_only_funcs_presentation_objects/get_combined_query.ts`
- **Type**: function-placement
- **Severity**: low
- **Description**: Main export function `buildCombinedQueryV2` at line 9 is good, follows preferred pattern

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/server_only_funcs_presentation_objects/get_query_context.ts`
- **Type**: function-placement
- **Severity**: low
- **Description**: Main export function `buildQueryContext` at line 13 is good, follows preferred pattern

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/worker_routines/stage_hmis_data_csv/worker.ts`
- **Type**: commented-code
- **Severity**: low
- **Description**: 104 out of 787 lines (13%) commented, appears to be debugging/logging code

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/worker_routines/stage_hmis_data_dhis2/worker.ts`
- **Type**: commented-code
- **Severity**: low
- **Description**: 54 out of 910 lines (6%) commented

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/worker_routines/integrate_hmis_data/worker.ts`
- **Type**: commented-code
- **Severity**: low
- **Description**: 58 out of 334 lines (17%) commented

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/server_only_funcs_importing/stage_structure_from_dhis2.ts`
- **Type**: commented-code
- **Severity**: low
- **Description**: 65 out of 508 lines (13%) commented

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/audit/example.ts`
- **Type**: commented-code
- **Severity**: low
- **Description**: 52 out of 200 lines (26%) commented - but this is an example file so may be intentional for documentation

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/db/project/modules.ts`
- **Type**: commented-code
- **Severity**: medium
- **Description**: 133 out of 689 lines (19%) commented, includes old module parameter routes and logic

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/db/instance/dataset_hfa.ts`
- **Type**: commented-code
- **Severity**: low
- **Description**: 105 out of 631 lines (17%) commented

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/db/instance/indicators.ts`
- **Type**: commented-code
- **Severity**: low
- **Description**: 101 out of 610 lines (17%) commented

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/exposed_env_vars.ts:124`
- **Type**: other
- **Severity**: low
- **Description**: Uses `!!` for boolean conversion multiple times, could use explicit boolean checks for clarity

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/exposed_env_vars.ts`
- **Type**: other
- **Severity**: low
- **Description**: Contains "_OLD" comment in code at line for backwards compatibility

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/cache_warming.ts:34`
- **Type**: other
- **Severity**: low
- **Description**: Function `warmAllCaches` has good structure with main function at top

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/routes/project/modules.ts:115-123`
- **Type**: commented-code
- **Severity**: low
- **Description**: Commented route for getting module parameters (9 lines)

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/server/server_only_funcs_csvs/get_csv_components_streaming_fast.ts`
- **Type**: other
- **Severity**: low
- **Description**: File name suggests it's an optimized version ("fast") but no legacy "slow" version visible - naming could be clearer

---

### Lib Directory

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/lib/cache_class_B_in_memory_map.ts:11`
- **Type**: naming
- **Severity**: medium
- **Description**: Class name `TimCacheB` contains unclear suffix "B". Should use descriptive naming instead of version-like letters.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/lib/translate/language_map_ui.ts:1`
- **Type**: naming
- **Severity**: low
- **Description**: Typo in constant name `_LANGAUGE_MAP_UI` (should be `_LANGUAGE_MAP_UI`).

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/lib/translate/language_map_content.ts:1`
- **Type**: naming
- **Severity**: low
- **Description**: Typo in constant name `_LANGAUGE_MAP_CONTENT` (should be `_LANGUAGE_MAP_CONTENT`).

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/lib/translate/t-func.ts:18`
- **Type**: naming
- **Severity**: low
- **Description**: Reference to `_LANGAUGE_MAP_UI` perpetuates the typo.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/lib/get_fetch_config_from_po.ts:21`
- **Type**: function-placement
- **Severity**: medium
- **Description**: Main/entrypoint function `getFetchConfigFromPresentationObjectConfig` is not at the top. Helper functions `getFiltersWithoutReplicant` and `getFiltersWithReplicant` appear at lines 222-252 but the main exported function is at line 21. Consider moving helper functions below the main function.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/lib/ai/chatbot_tools.ts:34`
- **Type**: function-placement
- **Severity**: low
- **Description**: Function `getToolActionLabel` appears after the constant definitions but before `hmisTools`. The exported constant `hmisTools` (line 39) is more important and should appear earlier with the function as a helper below.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/lib/table_structures/indicators.ts:26`
- **Type**: function-placement
- **Severity**: low
- **Description**: Function `get_INDICATOR_COMMON_IDS_IN_SORT_ORDER` is at the bottom after the constant `_COMMON_INDICATORS`. While it depends on the constant, it should be the primary export if it's the main function.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/lib/key_colors.ts:65`
- **Type**: function-placement
- **Severity**: low
- **Description**: Functions `getAbcQualScale` and `getAbcQualScale2` appear at the bottom after all constants. If these are main exported functions, they should be at the top.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/lib/types/instance.ts:324-328`
- **Type**: commented-code
- **Severity**: medium
- **Description**: Commented-out type definition `ItemsHolderDatasetAA2sAndIndicators` should be removed if no longer needed.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/lib/api-routes/route-utils.ts:54`
- **Type**: other
- **Severity**: low
- **Description**: Comment "No longer need BuildAPIRoutes - type information is embedded in the registry" suggests cleanup/refactoring was done but comment left behind. Should be removed.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/lib/api-routes/instance/indicators.ts:12-23`
- **Type**: other
- **Severity**: low
- **Description**: ASCII art comment for "Common" section is excessive and not self-documenting code. Should be replaced with a simple comment or removed.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/lib/api-routes/instance/indicators.ts:57-68`
- **Type**: other
- **Severity**: low
- **Description**: ASCII art comment for "Raw" section is excessive and not self-documenting code. Should be replaced with a simple comment or removed.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/lib/utils.ts:1-82`
- **Type**: other
- **Severity**: medium
- **Description**: File contains multiple unrelated utility functions without clear organization. Consider splitting into focused modules (e.g., `sql_utils.ts`, `replicant_utils.ts`, `json_utils.ts`).

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/lib/table_structures/dataset_hmis_validation.ts:1-5`
- **Type**: other
- **Severity**: low
- **Description**: Multi-line JSDoc-style comment block contradicts the project's "no unnecessary comments" preference. The functions themselves are self-documenting.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/lib/translate/t-func.ts:6`
- **Type**: other
- **Severity**: low
- **Description**: Mutable global object `_LANGUAGE` used for state management. Consider using a more robust state management pattern.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/lib/translate/t-func.ts:36`
- **Type**: other
- **Severity**: low
- **Description**: Mutable global object `_CALENDAR` used for state management. Consider using a more robust state management pattern.

---

### Module Defs Directory

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/hfa001/1.0.0/definition.ts:18-32`
- **Type**: commented-code
- **Severity**: low
- **Description**: Large ASCII art banner for "Results objects" section. Purely decorative and adds no value, increases file size unnecessarily.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/hfa001/1.0.0/definition.ts:69-80`
- **Type**: commented-code
- **Severity**: low
- **Description**: Large ASCII art banner for "Params" section. Purely decorative and adds no value.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m001/1.0.0/definition.ts:23-37`
- **Type**: commented-code
- **Severity**: low
- **Description**: Large ASCII art banner for "Results objects" section. Purely decorative.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m001/1.0.0/definition.ts:214-225`
- **Type**: commented-code
- **Severity**: low
- **Description**: Large ASCII art banner for "Params" section. Purely decorative.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m002/1.0.0/definition.ts:35-49`
- **Type**: commented-code
- **Severity**: low
- **Description**: Large ASCII art banner for "Results objects" section. Purely decorative.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m002/1.0.0/definition.ts:281-292`
- **Type**: commented-code
- **Severity**: low
- **Description**: Large ASCII art banner for "Params" section. Purely decorative.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m003/1.0.0/definition.ts:41-55`
- **Type**: commented-code
- **Severity**: low
- **Description**: Large ASCII art banner for "Results objects" section. Purely decorative.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m003/1.0.0/definition.ts:100-111`
- **Type**: commented-code
- **Severity**: low
- **Description**: ASCII art banner for "National" section. Purely decorative.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m003/1.0.0/definition.ts:162-173`
- **Type**: commented-code
- **Severity**: low
- **Description**: ASCII art banner for "AA 2" section. Purely decorative.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m003/1.0.0/definition.ts:230-241`
- **Type**: commented-code
- **Severity**: low
- **Description**: ASCII art banner for "AA 3" section. Purely decorative.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m003/1.0.0/definition.ts:300-311`
- **Type**: commented-code
- **Severity**: low
- **Description**: ASCII art banner for "AA 4" section. Purely decorative.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m003/1.0.0/definition.ts:400-411`
- **Type**: commented-code
- **Severity**: low
- **Description**: Large ASCII art banner for "Params" section. Purely decorative.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m004/1.0.0/definition.ts:37-51`
- **Type**: commented-code
- **Severity**: low
- **Description**: Large ASCII art banner for "Results objects" section. Purely decorative.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m004/1.0.0/definition.ts:152-163`
- **Type**: commented-code
- **Severity**: low
- **Description**: Large ASCII art banner for "Params" section. Purely decorative.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m005/1.0.0/definition.ts:120-134`
- **Type**: commented-code
- **Severity**: low
- **Description**: Large ASCII art banner for "Results objects" section. Purely decorative.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m005/1.0.0/definition.ts:218-228`
- **Type**: commented-code
- **Severity**: low
- **Description**: Inline comment for "Combined results" section. Less intrusive than ASCII art but still decorative.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m005/1.0.0/definition.ts:311-322`
- **Type**: commented-code
- **Severity**: low
- **Description**: Large ASCII art banner for "Params" section. Purely decorative.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m006/1.0.0/definition.ts:43-57`
- **Type**: commented-code
- **Severity**: low
- **Description**: Large ASCII art banner for "Results objects" section. Purely decorative.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m006/1.0.0/definition.ts:180-189`
- **Type**: commented-code
- **Severity**: medium
- **Description**: Commented-out results object definition (`M4_selected_denominator_per_indicator.csv`). Should be removed if not needed.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m006/1.0.0/definition.ts:190-201`
- **Type**: commented-code
- **Severity**: low
- **Description**: Large ASCII art banner for "Params" section. Purely decorative.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m002/1.0.0/definition.ts:128-155`
- **Type**: commented-code
- **Severity**: medium
- **Description**: Commented-out disaggregation options configuration. Should be removed if not needed.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m002/1.0.0/definition.ts:176-203`
- **Type**: commented-code
- **Severity**: medium
- **Description**: Commented-out disaggregation options configuration. Should be removed if not needed.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m002/1.0.0/definition.ts:225-252`
- **Type**: commented-code
- **Severity**: medium
- **Description**: Commented-out disaggregation options configuration. Should be removed if not needed.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m004/1.0.0/definition.ts:11`
- **Type**: naming
- **Severity**: medium
- **Description**: Script path uses "OLD_04_module_coverage_estimates.R" which contains legacy naming with "OLD" prefix, suggesting outdated code or need for cleanup.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m005/1.0.0/definition.ts:88`
- **Type**: naming
- **Severity**: low
- **Description**: Label "M5. Coverage estimates ~ new, part 1" contains "~ new" which is temporary/informal naming.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m006/1.0.0/definition.ts:5`
- **Type**: naming
- **Severity**: low
- **Description**: Label "M6. Coverage estimates ~ new, part 2" contains "~ new" which is temporary/informal naming.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m002/1.0.0/presentation_objects.ts:135`
- **Type**: other
- **Severity**: low
- **Description**: Footnote contains placeholder text "TBD" (To Be Determined) that should be replaced with actual content.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m006/1.0.0/definition.ts:522`
- **Type**: other
- **Severity**: low
- **Description**: Empty array in map function `...[].map((v) => ({ value: v, label: v }))` for DENOM_VITA options - appears incomplete.

---

- **File**: `/Users/timroberton/projects/_1_WEB_APPS/wb-fastr/module_defs/m006/1.0.0/definition.ts:536`
- **Type**: other
- **Severity**: low
- **Description**: Empty array in map function `...[].map((v) => ({ value: v, label: v }))` for DENOM_FULLIMM options - appears incomplete.

---
