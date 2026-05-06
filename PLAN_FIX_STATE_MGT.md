# State Management Fix Plan

Based on comprehensive review against `DOC_STATE_MGT_TIERS.md`.

---

## Critical: T2 Cache Invalidation Bugs

### 1. HFA Dataset Items Holder - Non-reactive getter in parent
- **File**: `client/src/components/instance_dataset_hfa/index.tsx:221`
- **Issue**: Parent passes `cacheHash={getHfaCacheHash()}` using a non-reactive getter
- **Effect**: When `instanceState.hfaCacheHash` changes via SSE, child won't re-render because getter uses `unwrap()`
- **Fix**: Change to `cacheHash={instanceState.hfaCacheHash}`
- **Status**: [x] VERIFIED BUG

### 2. HMIS Dataset Items Holder - Non-reactive getter for indicator version
- **File**: `client/src/components/instance_dataset_hmis/index.tsx:300`
- **Issue**: Parent passes `indicatorMappingsVersion={getIndicatorMappingsVersion()}` using non-reactive getter
- **Effect**: If indicator mappings change but dataset version doesn't, child won't refetch
- **Fix**: Change to `indicatorMappingsVersion={instanceState.indicatorMappingsVersion}`
- **Status**: [x] VERIFIED BUG

### 3. HMIS Dataset Items Holder - Non-reactive getter for facility columns
- **File**: `client/src/components/instance_dataset_hmis/index.tsx:301`
- **Issue**: Parent passes `facilityColumns={getInstanceFacilityColumns()}` using non-reactive getter
- **Fix**: Change to `facilityColumns={instanceState.facilityColumns}`
- **Status**: [x] VERIFIED BUG

---

## High Priority: Manual Polling (T3 justified but could use SSE)

These use `setInterval` polling for upload progress. The tier doc classifies this as T3 (on-demand), which is technically correct for transient upload state. However, the SSE infrastructure exists and could be used.

### 4. HFA Dataset Index - 5s Polling
- **File**: `client/src/components/instance_dataset_hfa/index.tsx:48-56`
- **Pattern**: `setInterval` every 5s to fetch `uploadAttempt` status
- **Assessment**: T3 pattern is acceptable for upload status (transient, per-user)
- **Optional improvement**: Could use instance SSE if upload status were added to T1 store
- **Status**: [x] VERIFIED - Style choice, not violation

### 5. HMIS Dataset Index - 5s Polling
- **File**: `client/src/components/instance_dataset_hmis/index.tsx:51-59`
- **Same pattern as #4**
- **Status**: [x] VERIFIED - Style choice, not violation

### 6. HFA Import - 2s Polling for progress
- **File**: `client/src/components/instance_dataset_hfa_import/index.tsx:100-130`
- **Pattern**: `setInterval` every 2s for staging/integrating progress
- **Assessment**: T3 justified - progress is transient, user-specific workflow state
- **Status**: [x] VERIFIED - T3 compliant

### 7. HMIS Import - 2s Polling for progress
- **File**: `client/src/components/instance_dataset_hmis_import/index.tsx:117-148`
- **Same pattern as #6**
- **Status**: [x] VERIFIED - T3 compliant

---

## High Priority: silentFetch Prop-Passing

These pass `silentFetch` callbacks as props. This is a T3 pattern for on-demand refresh of transient upload state. Not a violation, but creates prop-drilling.

### 8. HFA Dataset - silentFetch prop
- **File**: `client/src/components/instance_dataset_hfa/index.tsx:75,86,97`
- **Assessment**: T3 compliant - upload status is transient per-user state
- **Status**: [x] VERIFIED - T3 compliant (not violation)

### 9. HMIS Dataset - silentFetch prop
- **File**: `client/src/components/instance_dataset_hmis/index.tsx:78,102`
- **Same as #8**
- **Status**: [x] VERIFIED - T3 compliant (not violation)

---

## High Priority: Server Data in Component Signals

These store upload attempt status in component signals. This is T3 compliant since upload status is transient, per-user workflow state that doesn't need multi-user sync.

### 10. HFA Dataset - uploadAttempt signal
- **File**: `client/src/components/instance_dataset_hfa/index.tsx:33-35`
- **Assessment**: T3 compliant - transient upload workflow state
- **Status**: [x] VERIFIED - T3 compliant (not violation)

### 11. HMIS Dataset - uploadAttempt signal
- **File**: `client/src/components/instance_dataset_hmis/index.tsx:36-38`
- **Same as #10**
- **Status**: [x] VERIFIED - T3 compliant (not violation)

### 12. Visualization Editor - itemsHolder signal
- **File**: `client/src/components/visualization/visualization_editor_inner.tsx:118-130`
- **Assessment**: T3 compliant - ephemeral editor state, not shared
- **Status**: [x] VERIFIED - T3 compliant (not violation)

---

## Medium Priority: Style Non-Compliance

### 13. Structure With CSV - T1 reads buried in function
- **File**: `client/src/components/structure/with_csv.tsx:46-48`
- **Issue**: `createEffect` calls `attemptGetStructureItems()` which reads T1 state inside the function body
- **Effect**: Works correctly (T1 reads ARE tracked), but violates canonical pattern style
- **Canonical pattern**: Read T1 version keys explicitly in effect body, not buried in helper
- **Fix (optional)**: Refactor to read `instanceState.structureLastUpdated` directly in effect
- **Status**: [x] VERIFIED - Style issue, not functional bug

---

## Medium Priority: Dead Code

### 14. Unused T4 file - t4_long_form_editor.ts
- **File**: `client/src/state/project/t4_long_form_editor.ts`
- **Issue**: Exports `longFormEditorState` but never imported anywhere
- **Fix**: Delete file
- **Status**: [x] VERIFIED DEAD CODE

### 15. Unused T4 file - t4_ai_interpretations.ts
- **File**: `client/src/state/project/t4_ai_interpretations.ts`
- **Issue**: Exports `getInterpretationData`, `updateInterpretationData`, etc. but never imported
- **Note**: Contains `setInterval` at module scope that would run if imported
- **Fix**: Delete file
- **Status**: [x] VERIFIED DEAD CODE

### 16. Unused T2 cache - _SLIDE_DECK_META_CACHE
- **File**: `client/src/state/project/t2_slides.ts:13-20`
- **Issue**: `_SLIDE_DECK_META_CACHE` is defined but never imported anywhere
- **Fix**: Delete the cache definition (lines 13-20)
- **Status**: [x] VERIFIED DEAD CODE

---

## Medium Priority: projectState Passed as Props

Multiple components receive `projectState` via props instead of importing from T1 store. `projectState` IS exported from `t1_store.ts` (line 165), so components could import directly.

### 17. Components receiving projectState as props
- **Files** (visualization):
  - `client/src/components/visualization/index.tsx:159,200,241`
  - `client/src/components/visualization/visualization_editor_inner.tsx:70-72`
  - `client/src/components/visualization/presentation_object_editor_panel.tsx:70,83,93`
  - `client/src/components/PresentationObjectPanelDisplay.tsx` (extensive usage)
- **Files** (slide deck):
  - `client/src/components/slide_deck/index.tsx:26` - receives `projectState` prop, uses `.id` and passes to children
  - `client/src/components/project/project_decks.tsx:79` - passes `projectState` to `ProjectAiSlideDeck`
- **Files** (project):
  - `client/src/components/project/project_metrics.tsx:87` - passes `projectState` to internal `MetricGroupCard`
  - `client/src/components/project/project_data.tsx:101` - passes `projectState` to `SettingsForProjectDatasetHmis`
  - `client/src/components/project/settings_for_project_dataset_hmis.tsx:37` - receives `projectState` but only uses `.id`
- **Issue**: `projectState` passed as prop through component hierarchy
- **Fix**: Import `projectState` from `~/state/project/t1_store` directly
- **Note**: Some of these go through `_editor_snapshot.ts` which is INTENTIONAL (see below)
- **Status**: [ ] TO REVIEW - Need to distinguish intentional snapshots from unnecessary prop drilling

### 18. Editor snapshot pattern (INTENTIONAL - Architecture Decision)
- **File**: `client/src/components/_editor_snapshot.ts`
- **Pattern**: Creates deep clones of `projectState` for editors via `structuredClone(unwrap(...))`
- **Purpose**: Editors need stable data during editing; live SSE updates mid-edit would cause UX issues
- **Assessment**: This is INTENTIONAL design, not a violation
- **Question**: What happens when another user modifies data being edited? (Conflict resolution)
- **Status**: [x] NOT A BUG - Architecture decision, but may need conflict resolution strategy

---

## Medium Priority: Incomplete T2 Encapsulation

### 19. t2_slides missing access functions
- **File**: `client/src/state/project/t2_slides.ts`
- **Issue**: Exports `_SLIDE_CACHE` directly without wrapper function
- **Pattern**: Other T2 files export `get*FromCacheOrFetch()` functions
- **Fix**: Add `getSlideFromCacheOrFetch()` function for consistency
- **Note**: `_SLIDE_DECK_META_CACHE` is being deleted (issue #16)
- **Status**: [x] VERIFIED - Breaks encapsulation pattern

---

## Medium Priority: Non-Persisted T4 State

### 20. t4_ui.ts - Session-only states (intentional?)
- **File**: `client/src/state/t4_ui.ts:154-181`
- **States without localStorage**:
  - `fitWithin` (line 154) - chart fit mode
  - `showAi` (line 160) - AI panel visibility
  - `headerOrContent` (line 166) - editor mode
  - `policyHeaderOrContent` (line 168) - editor mode
  - `showModules` (line 174) - selected module
  - `moduleLatestCommits` (line 180) - cached server data
- **Assessment**: These survive component mounts but reset on page refresh
- **Question**: Is this intentional? If not, add localStorage persistence
- **Status**: [x] VERIFIED - Need clarification on intent

---

## Removed From Plan (Not Violations)

### ~~disaggregation_label.ts missing prefix~~
- **File**: `client/src/state/instance/disaggregation_label.ts`
- **Reason**: This is a UTILITY file with pure functions, not state. Correct to have no tier prefix.

### ~~Language preference not in T4~~
- **File**: `client/src/components/LoggedInWrapper.tsx`
- **Reason**: `LANGUAGE_STORAGE_KEY` is in shared `lib` package for SSR/hydration purposes. Keeping it out of t4_ui.ts is intentional.

### ~~instance_users.tsx props passing~~
- **File**: `client/src/components/instance/instance_users.tsx:93`
- **Reason**: `projects={instanceState.projects}` IS a reactive read. Not a violation.

### ~~instance_projects.tsx props passing~~
- **File**: `client/src/components/instance/instance_projects.tsx:63`
- **Reason**: `users: instanceState.users` IS a reactive read. Not a violation.

---

## Summary

| Category | Count | Action |
|----------|-------|--------|
| Critical bugs (non-reactive getters) | 3 | Fix immediately |
| Dead code | 3 | Delete |
| Props drilling (projectState) | 1 | Review and refactor |
| Style non-compliance | 2 | Optional refactor |
| Architecture decision (snapshot) | 1 | No action (intentional) |
| Question on intent | 1 | Clarify with user |
| Not violations (removed) | 8 | No action |

### Immediate Fixes Needed

1. **`instance_dataset_hfa/index.tsx:221`**: Change `getHfaCacheHash()` to `instanceState.hfaCacheHash`
2. **`instance_dataset_hmis/index.tsx:300`**: Change `getIndicatorMappingsVersion()` to `instanceState.indicatorMappingsVersion`
3. **`instance_dataset_hmis/index.tsx:301`**: Change `getInstanceFacilityColumns()` to `instanceState.facilityColumns`
4. **`state/project/t4_long_form_editor.ts`**: Delete file (dead code)
5. **`state/project/t4_ai_interpretations.ts`**: Delete file (dead code)
6. **`state/project/t2_slides.ts:13-20`**: Delete `_SLIDE_DECK_META_CACHE` (dead code)
